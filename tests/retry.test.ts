import { describe, expect, it, vi } from "vitest";
import { ModelCooldowns, ServiceBusyError, classifyFailure, cooldownMs, isTransient, withModelFallback } from "@/lib/retry";

const busy = () => Object.assign(new Error("high demand"), { status: 503 });
const noSleep = () => Promise.resolve();

describe("isTransient", () => {
  it("treats overload and rate-limit statuses as transient", () => {
    expect([429, 500, 503, 504].every((status) => isTransient({ status }))).toBe(true);
  });

  it("fails fast on client errors such as bad requests or invalid keys", () => {
    expect(isTransient({ status: 400 })).toBe(false);
    expect(isTransient({ status: 403 })).toBe(false);
  });

  it("treats network failures as transient", () => {
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("withModelFallback", () => {
  it("returns the first successful model without extra calls", async () => {
    const call = vi.fn(async (model: string) => `ok:${model}`);
    await expect(withModelFallback(["a", "b"], call, { sleep: noSleep })).resolves.toEqual({ result: "ok:a", model: "a" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries once, then falls back to the next model", async () => {
    const seen: string[] = [];
    const result = await withModelFallback(
      ["primary", "backup"],
      async (model) => {
        seen.push(model);
        if (model === "primary") throw busy();
        return "done";
      },
      { sleep: noSleep },
    );
    expect(seen).toEqual(["primary", "primary", "backup"]);
    expect(result.model).toBe("backup");
  });

  it("tells the caller which model the next attempt will use", async () => {
    const next: (string | null)[] = [];
    await withModelFallback(
      ["a", "b"],
      async () => {
        throw busy();
      },
      { sleep: noSleep, onRetry: ({ nextModel }) => next.push(nextModel) },
    ).catch(() => {});
    expect(next).toEqual(["a", "b", "b", null]);
  });

  it("does not retry non-transient errors", async () => {
    const call = vi.fn(async () => {
      throw Object.assign(new Error("API key invalid"), { status: 400 });
    });
    await expect(withModelFallback(["a", "b"], call, { sleep: noSleep })).rejects.toThrow("API key invalid");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("raises ServiceBusyError when every model is overloaded", async () => {
    const call = async () => {
      throw busy();
    };
    await expect(withModelFallback(["a", "b"], call, { sleep: noSleep })).rejects.toBeInstanceOf(ServiceBusyError);
  });

  it("backs off between retries", async () => {
    const sleep = vi.fn(noSleep);
    await withModelFallback(
      ["a", "b"],
      async (m) => {
        if (m === "a") throw busy();
        return 1;
      },
      { sleep, backoffMs: 500 },
    ).catch(() => {});
    expect(sleep).toHaveBeenCalledWith(500);
  });
});

describe("failure classification and cooldowns (found in live quota testing)", () => {
  const quota = (message = "Quota exceeded quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier") =>
    Object.assign(new Error(message), { status: 429 });
  const gone = () => Object.assign(new Error("model no longer available"), { status: 404 });
  const timeout = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });

  it("classifies each upstream failure", () => {
    expect(classifyFailure(busy())).toBe("overload");
    expect(classifyFailure(quota())).toBe("quota");
    expect(classifyFailure(gone())).toBe("unavailable");
    expect(classifyFailure(timeout())).toBe("timeout");
    expect(classifyFailure({ status: 401 })).toBe("fatal");
  });

  it("skips a quota-exhausted or retired model immediately, without retrying it", async () => {
    const seen: string[] = [];
    const result = await withModelFallback(
      ["spent", "retired", "fresh"],
      async (m) => {
        seen.push(m);
        if (m === "spent") throw quota();
        if (m === "retired") throw gone();
        return m;
      },
      { sleep: noSleep },
    );
    expect(seen).toEqual(["spent", "retired", "fresh"]);
    expect(result.model).toBe("fresh");
  });

  it("remembers exhausted models so later requests go straight to a working one", async () => {
    let now = 0;
    const cooldowns = new ModelCooldowns(() => now);
    const call = vi.fn(async (m: string) => {
      if (m === "spent") throw quota();
      return m;
    });
    await withModelFallback(["spent", "fresh"], call, { sleep: noSleep, cooldowns, now: () => now });
    call.mockClear();
    await withModelFallback(["spent", "fresh"], call, { sleep: noSleep, cooldowns, now: () => now });
    expect(call.mock.calls.map((c) => c[0])).toEqual(["fresh"]);

    now += 61 * 60_000; // daily-quota cooldown is rechecked after an hour
    expect(cooldowns.isCooling("spent")).toBe(false);
  });

  it("still tries everything when every model is cooling down", () => {
    const cooldowns = new ModelCooldowns(() => 0);
    cooldowns.mark("a", 1000);
    cooldowns.mark("b", 1000);
    expect(cooldowns.order(["a", "b"])).toEqual(["a", "b"]);
  });

  it("moves on from a hung model instead of waiting on it again", async () => {
    const seen: string[] = [];
    await withModelFallback(
      ["stuck", "ok"],
      async (m) => {
        seen.push(m);
        if (m === "stuck") throw timeout();
        return m;
      },
      { sleep: noSleep },
    );
    expect(seen).toEqual(["stuck", "ok"]);
  });

  it("passes each attempt an abort signal bounded by the remaining deadline", async () => {
    let signal: AbortSignal | undefined;
    await withModelFallback(["a"], async (_m, s) => {
      signal = s;
      return 1;
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it("stops before the serverless deadline instead of starting a doomed attempt", async () => {
    let now = 0;
    const call = vi.fn(async () => {
      now += 52_000;
      throw busy();
    });
    const err = await withModelFallback(["a", "b"], call, { sleep: noSleep, now: () => now, deadlineMs: 55_000 }).catch((e) => e);
    expect(call).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ServiceBusyError);
  });

  it("reports quota exhaustion distinctly, so users are told to come back later", async () => {
    const err = await withModelFallback(["a", "b"], async () => {
      throw quota();
    }).catch((e) => e);
    expect(err).toMatchObject({ quotaExhausted: true });
  });

  it("derives cooldowns from the quota type or the server's retry hint", () => {
    expect(cooldownMs("quota", quota())).toBe(60 * 60_000);
    expect(cooldownMs("quota", quota('Rate limited "retryDelay":"37s"'))).toBe(37_000);
    expect(cooldownMs("unavailable", gone())).toBe(6 * 60 * 60_000);
    expect(cooldownMs("overload", busy())).toBe(0);
  });
});
