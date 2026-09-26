import { describe, expect, it } from "vitest";
import { NdjsonDecoder } from "@/lib/ndjson";

describe("NdjsonDecoder", () => {
  it("parses events split across arbitrary chunk boundaries", () => {
    const d = new NdjsonDecoder<{ n: number }>();
    expect(d.push('{"n":1}\n{"n"')).toEqual([{ n: 1 }]);
    expect(d.push(":2}\n\n{")).toEqual([{ n: 2 }]);
    expect(d.push('"n":3}')).toEqual([]);
    expect(d.flush()).toEqual([{ n: 3 }]);
  });

  it("returns nothing for an empty stream", () => {
    const d = new NdjsonDecoder();
    expect(d.push("")).toEqual([]);
    expect(d.flush()).toEqual([]);
  });
});
