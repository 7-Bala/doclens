import { describe, expect, it } from "vitest";
import { segmentClauses } from "@/lib/clauses";
import { normalize, overlapRatio, verifyFigures, verifyQuote } from "@/lib/verify";

const clauses = segmentClauses([
  [
    "4. SECURITY DEPOSIT",
    "The Licensee shall pay a refundable security deposit of Rs. 1,50,000. The Licensor’s decision on deductions shall be final.",
    "",
    "5. LOCK-IN",
    "If the Licensee vacates during the lock-in period, the security deposit shall be forfeited.",
  ].join("\n"),
]);

describe("normalize", () => {
  it("ignores case, curly quotes, dashes and extra whitespace", () => {
    expect(normalize("The  Licensor’s  “Decision” — FINAL")).toBe(`the licensor's "decision" - final`);
  });
});

describe("verifyQuote", () => {
  it("verifies an exact quote and finds its clause", () => {
    const v = verifyQuote("the security deposit shall be forfeited", "B", clauses);
    expect(v).toEqual({ status: "verified", clauseId: "B" });
  });

  it("corrects a wrong clause id from the model", () => {
    const v = verifyQuote("decision on deductions shall be final", "B", clauses);
    expect(v).toEqual({ status: "verified", clauseId: "A" });
  });

  it("tolerates small wording differences as approximate", () => {
    const v = verifyQuote("If the Licensee vacates during lock-in period, the security deposit will be forfeited", "B", clauses);
    expect(v.status).toBe("approximate");
    expect(v.clauseId).toBe("B");
  });

  it("flags a hallucinated quote as unverified", () => {
    const v = verifyQuote("The tenant must pay three months rent as penalty for pets", "A", clauses);
    expect(v).toEqual({ status: "unverified", clauseId: null });
  });

  it("refuses to verify quotes that are too short to be meaningful", () => {
    expect(verifyQuote("the", "A", clauses).status).toBe("unverified");
  });
});

describe("overlapRatio", () => {
  it("is 1 for a contained quote and 0 for unrelated text", () => {
    expect(overlapRatio("security deposit", "a refundable security deposit")).toBe(1);
    expect(overlapRatio("pet policy", "a refundable security deposit")).toBe(0);
  });
});

describe("verifyFigures", () => {
  it("accepts values whose numbers appear in the cited clause", () => {
    expect(verifyFigures("Rs. 1,50,000", "A", clauses)).toBe("verified");
  });

  it("rejects invented or altered numbers", () => {
    expect(verifyFigures("Rs. 2,00,000", "A", clauses)).toBe("unverified");
  });

  it("rejects citations to clauses that do not exist", () => {
    expect(verifyFigures("Rs. 1,50,000", "CU", clauses)).toBe("unverified");
  });
});

describe("PDF wrap artifacts (regressions found in live testing)", () => {
  const wrapped = segmentClauses([
    "2. TERM\nThe licence is for 11 months commencing from 1st October 20 26.\n\n4. DEPOSIT\nA deposit of Rs. 1,50, 000 is payable betwee n the parties by the Licen- see.",
  ]);

  it("verifies a healed quote against text with mid-word breaks and hyphenation", () => {
    expect(verifyQuote("A deposit of Rs. 1,50,000 is payable between the parties by the Licensee", "B", wrapped).status).toBe(
      "verified",
    );
  });

  it("verifies figures split by a line wrap", () => {
    expect(verifyFigures("1st October 2026", "A", wrapped)).toBe("verified");
    expect(verifyFigures("Rs. 1,50,000", "B", wrapped)).toBe("verified");
  });

  it("still rejects genuinely different figures", () => {
    expect(verifyFigures("Rs. 1,60,000", "B", wrapped)).toBe("unverified");
  });
});
