/**
 * Resilience for upstream AI calls. Failures are classified, because each needs a different
 * response:
 *  - overload (503, 500, network): momentary, so retry the same model once, then move on
 *  - quota (429): this model's quota is spent; retrying it is pointless, so move on at once
 *    and remember it for a while
 *  - unavailable (404): the model is retired or not offered to this key; skip it for hours
 *  - timeout: the model is stuck; do not wait on it again, try the next model
 *  - anything else (400, 401, 403): a bad request or key; other models will not help
 * Free-tier quotas are per model, so walking a chain of models multiplies daily capacity.
 */

export class ServiceBusyError extends Error {
  constructor(
    message: string,
    /** True when every model failed on quota, so the user should try again later rather than now. */
    readonly quotaExhausted: boolean,
  ) {
    super(message);
  }
}

export type FailureKind = "overload" | "timeout" | "quota" | "unavailable" | "fatal";

const OVERLOAD_STATUSES = new Set([408, 500, 502, 503, 504]);

export function classifyFailure(error: unknown): FailureKind {
  if (typeof error !== "object" || error === null) return "fatal";
  const name = (error as { name?: unknown }).name;
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  const status = (error as { status?: unknown }).status;
  if (status === 429) return "quota";
  if (status === 404) return "unavailable";
  if (typeof status === "number") return OVERLOAD_STATUSES.has(status) ? "overload" : "fatal";
  // Network-level failures (fetch TypeError, socket resets) carry no status.
  const message = String((error as Error).message);
  return error instanceof TypeError || /ECONNRESET|ETIMEDOUT|fetch failed/i.test(message) ? "overload" : "fatal";
}

/** Backwards-compatible helper: can another attempt (same or other model) succeed? */
export function isTransient(error: unknown): boolean {
  return classifyFailure(error) !== "fatal";
}

/** How long to avoid a model after a failure. Daily quotas are rechecked hourly, not every request. */
export function cooldownMs(kind: FailureKind, error: unknown): number {
  if (kind === "unavailable") return 6 * 60 * 60_000;
  if (kind !== "quota") return 0;
  const message = String((error as Error)?.message ?? "");
  if (/PerDay/i.test(message)) return 60 * 60_000;
  const retry = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(message);
  return retry ? Math.ceil(Number(retry[1]) * 1000) : 60_000;
}

/** Remembers models that recently ran out of quota or were unavailable. */
export class ModelCooldowns {
  private readonly until = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  mark(model: string, ms: number): void {
    if (ms > 0) this.until.set(model, this.now() + ms);
  }

  isCooling(model: string): boolean {
    const t = this.until.get(model);
    if (t === undefined) return false;
    if (t <= this.now()) {
      this.until.delete(model);
      return false;
    }
    return true;
  }

  /** Models to try now: ready ones first; if every model is cooling, try them all anyway. */
  order(models: string[]): string[] {
    const ready = models.filter((m) => !this.isCooling(m));
    return ready.length ? ready : models;
  }
}

/** Shared across requests in this server instance. */
export const sharedCooldowns = new ModelCooldowns();

export interface FallbackOptions {
  retriesPerModel?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  cooldowns?: ModelCooldowns;
  /** Longest a single attempt may run before the next model is tried. */
  attemptTimeoutMs?: number;
  /** Total time budget for the whole chain (keeps us inside the serverless function limit). */
  deadlineMs?: number;
  now?: () => number;
  /** `nextModel` is the model the next attempt will use, or null when none are left. */
  onRetry?: (info: { model: string; attempt: number; error: unknown; kind: FailureKind; nextModel: string | null }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `call` against each model in order until one succeeds. Returns the result and the model used. */
/** Smallest slice of time worth starting a new attempt with. */
const MIN_ATTEMPT_MS = 4_000;

export async function withModelFallback<T>(
  models: string[],
  call: (model: string, signal: AbortSignal) => Promise<T>,
  {
    retriesPerModel = 1,
    backoffMs = 800,
    sleep = defaultSleep,
    cooldowns = new ModelCooldowns(),
    attemptTimeoutMs = 30_000,
    deadlineMs = 55_000,
    now = Date.now,
    onRetry,
  }: FallbackOptions = {},
): Promise<{ result: T; model: string }> {
  const chain = cooldowns.order(models);
  const deadline = now() + deadlineMs;
  let lastError: unknown;
  let allQuota = true;

  outer: for (const [index, model] of chain.entries()) {
    for (let attempt = 0; attempt <= retriesPerModel; attempt++) {
      const remaining = deadline - now();
      if (remaining < MIN_ATTEMPT_MS) {
        allQuota = false;
        break outer;
      }
      try {
        return { result: await call(model, AbortSignal.timeout(Math.min(attemptTimeoutMs, remaining))), model };
      } catch (error) {
        const kind = classifyFailure(error);
        if (kind === "fatal") throw error;
        lastError = error;
        if (kind !== "quota") allQuota = false;
        if (kind === "timeout") lastError = new Error(`${model} timed out`);
        cooldowns.mark(model, cooldownMs(kind, error));

        const retrySame = kind === "overload" && attempt < retriesPerModel;
        onRetry?.({ model, attempt, error, kind, nextModel: retrySame ? model : (chain[index + 1] ?? null) });
        if (!retrySame) break;
        await sleep(backoffMs * (attempt + 1));
      }
    }
  }

  throw new ServiceBusyError(
    `All AI models failed (${chain.join(", ")}): ${lastError instanceof Error ? lastError.message.slice(0, 200) : "unknown"}`,
    allQuota,
  );
}
