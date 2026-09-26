import { describe, expect, it } from "vitest";
import { formatClausesForPrompt, humanizeClauseRefs, letterId, normalizeClauseId, segmentClauses } from "@/lib/clauses";

describe("segmentClauses", () => {
  it("uses the document's own numbering as labels", () => {
    const clauses = segmentClauses([
      "AGREEMENT\n\n1. TERM\nThe term is 11 months.\n\n2. RENT\nRent is Rs. 25,000.\n(a) Payable monthly.",
    ]);
    expect(clauses.map((c) => c.label)).toEqual(["Paragraph 1", "Clause 1", "Clause 2", "Clause a"]);
    expect(clauses[1].text).toBe("1. TERM The term is 11 months.");
  });

  it("recognises Clause/Section/Article headings", () => {
    const clauses = segmentClauses(["Clause 7 Termination applies.\nSection 3.1 Payment terms.\nArticle IV Governing law."]);
    expect(clauses.map((c) => c.label)).toEqual(["Clause 7", "Clause 3.1", "Clause IV"]);
  });

  it("tracks page numbers and assigns sequential ids", () => {
    const clauses = segmentClauses(["First page text.", "Second page text."]);
    expect(clauses).toMatchObject([
      { id: "A", page: 1 },
      { id: "B", page: 2 },
    ]);
  });

  it("splits very long paragraphs on sentence boundaries", () => {
    const sentence = "The licensee shall comply with every rule of the society at all times. ";
    const clauses = segmentClauses([sentence.repeat(40)]);
    expect(clauses.length).toBeGreaterThan(1);
    expect(clauses.every((c) => c.text.length <= 1_500)).toBe(true);
    expect(clauses[0].label).toBe("Paragraph 1 (part 1)");
  });

  it("ignores blank input", () => {
    expect(segmentClauses(["", "  \n \n"])).toEqual([]);
  });

  it("formats clauses with ids for the prompt", () => {
    const text = formatClausesForPrompt(segmentClauses(["1. Rent is due."]));
    expect(text).toBe("[A] (Clause 1, p.1) 1. Rent is due.");
  });
});

describe("clause id hygiene (regressions found in live testing)", () => {
  const clauses = segmentClauses(["Intro text.\n\n4. DEPOSIT\nDeposit is Rs. 100."]);

  it("normalizes echoed prompt notation to bare ids", () => {
    expect(normalizeClauseId("[B]")).toBe("B");
    expect(normalizeClauseId(" b ")).toBe("B");
    expect(normalizeClauseId("B")).toBe("B");
  });

  it("rewrites internal ids to human labels in user-facing text", () => {
    expect(humanizeClauseRefs("Is the deposit clause ([B]) enforceable?", clauses)).toBe(
      "Is the deposit clause (Clause 4) enforceable?",
    );
  });

  it("drops unknown ids and the empty parentheses they leave behind", () => {
    expect(humanizeClauseRefs("See the terms ([CU]) carefully.", clauses)).toBe("See the terms carefully.");
  });
});

describe("letterId", () => {
  it("uses bijective base-26 letters that cannot be mistaken for clause numbers", () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(letterId)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("never produces digits, so the prompt's only numbers are the document's real labels", () => {
    const clauses = segmentClauses(Array.from({ length: 40 }, (_, i) => `${i + 1}. Clause body ${i + 1}.`));
    expect(clauses.every((c) => /^[A-Z]+$/.test(c.id))).toBe(true);
    expect(formatClausesForPrompt(clauses)).toContain("[AN] (Clause 40, p.40)");
  });
});
