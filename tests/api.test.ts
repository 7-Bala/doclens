import { beforeAll, describe, expect, it } from "vitest";
import { POST as analyze } from "@/app/api/analyze/route";
import { POST as extract } from "@/app/api/extract/route";

// With no API key the real Gemini client fails fast with a ConfigError (no network access),
// which lets these tests exercise the true request pipeline end to end.
beforeAll(() => {
  delete process.env.GEMINI_API_KEY;
});

const post = (body: unknown, ip: string) =>
  new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/analyze", () => {
  it("rejects malformed JSON with 400", async () => {
    const res = await analyze(post("{not json", "1.1.1.1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body must be valid JSON." });
  });

  it("rejects invalid input with a helpful message", async () => {
    const res = await analyze(post({ pages: [""], role: "tenant" }, "1.1.1.1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/empty/i);
  });

  it("returns 503 without leaking configuration details when the API key is missing", async () => {
    const res = await analyze(post({ pages: ["1. Rent is Rs. 100."], role: "tenant" }, "2.2.2.2"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await res.json())).not.toContain("GEMINI_API_KEY");
  });

  it("rate-limits a single client after 10 requests per minute", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await analyze(post({ pages: [`Doc ${i} text`], role: "tenant" }, "3.3.3.3"))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 503)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe("POST /api/analyze?stream=1", () => {
  it("streams real progress, then a safe error event when the AI is unavailable", async () => {
    const req = new Request("http://localhost/api/analyze?stream=1", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "4.4.4.4" },
      body: JSON.stringify({ pages: ["1. Rent is Rs. 100.\n\nCall 9876543210."], role: "tenant" }),
    });
    const res = await analyze(req);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((e) => `${e.type}:${e.stage ?? e.status}`)).toEqual([
      "progress:privacy",
      "progress:segment",
      "progress:reading",
      "error:503",
    ]);
    expect(events[0].detail).toBe("Hidden: phone number");
    expect(JSON.stringify(events)).not.toContain("GEMINI_API_KEY");
  });

  it("still rejects invalid input with a plain 400 before streaming", async () => {
    const req = new Request("http://localhost/api/analyze?stream=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pages: [""], role: "tenant" }),
    });
    expect((await analyze(req)).status).toBe(400);
  });
});

describe("POST /api/extract", () => {
  it("rejects files that are not really PDFs", async () => {
    const form = new FormData();
    form.append("file", new File(["hello"], "notes.pdf", { type: "application/pdf" }));
    const res = await extract(new Request("http://localhost/api/extract", { method: "POST", body: form }));
    expect(res.status).toBe(415);
  });

  it("requires a file", async () => {
    const res = await extract(new Request("http://localhost/api/extract", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
});
