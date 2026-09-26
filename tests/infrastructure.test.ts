import { describe, expect, it } from "vitest";
import { LruCache, hashKey } from "@/lib/cache";
import { itemsToText } from "@/lib/pdf";
import { RateLimiter, clientKey } from "@/lib/rateLimit";
import { analyzeRequestSchema, askRequestSchema, LIMITS } from "@/lib/schemas";

describe("LruCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.size).toBe(2);
  });

  it("hashes equal inputs to equal keys", () => {
    expect(hashKey({ a: 1 }, "x")).toBe(hashKey({ a: 1 }, "x"));
    expect(hashKey({ a: 1 })).not.toBe(hashKey({ a: 2 }));
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit per window, then resets", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1_000, () => now);
    expect([limiter.check("ip"), limiter.check("ip"), limiter.check("ip")]).toEqual([true, true, false]);
    expect(limiter.check("other")).toBe(true);
    now = 1_000;
    expect(limiter.check("ip")).toBe(true);
  });

  it("reads the client ip from proxy headers", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientKey(req)).toBe("1.2.3.4");
  });
});

describe("request schemas", () => {
  const valid = { pages: ["Some agreement text"], role: "tenant" };

  it("applies defaults", () => {
    expect(analyzeRequestSchema.parse(valid)).toEqual({ ...valid, concerns: [], language: "English" });
  });

  it("rejects empty, oversized and malformed documents", () => {
    expect(analyzeRequestSchema.safeParse({ ...valid, pages: ["  "] }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ ...valid, pages: ["x".repeat(LIMITS.maxDocumentChars + 1)] }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ ...valid, role: "landlord" }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ ...valid, concerns: Array(10).fill("x") }).success).toBe(false);
  });

  it("bounds question length", () => {
    expect(askRequestSchema.safeParse({ ...valid, question: "hi" }).success).toBe(false);
    expect(askRequestSchema.safeParse({ ...valid, question: "q".repeat(501) }).success).toBe(false);
    expect(askRequestSchema.safeParse({ ...valid, question: "Can I keep a pet?" }).success).toBe(true);
  });
});

describe("itemsToText (PDF layout)", () => {
  it("rebuilds lines and paragraph gaps from positioned text", () => {
    const text = itemsToText([
      { str: "Term", x: 50, y: 700, fontSize: 10 },
      { str: "1.", x: 10, y: 700, fontSize: 10 },
      { str: "is 11 months.", x: 10, y: 688, fontSize: 10 },
      { str: "2. Rent", x: 10, y: 650, fontSize: 10 },
      { str: " ", x: 10, y: 640, fontSize: 10 },
    ]);
    expect(text).toBe("1. Term\nis 11 months.\n\n2. Rent");
  });

  it("returns an empty string for image-only pages", () => {
    expect(itemsToText([])).toBe("");
  });
});
