import { describe, expect, it, vi } from "vitest";
import { analyzeDocument, answerQuestion, type StructuredGenerator } from "@/lib/analyze";
import type { ModelAnalysis, ModelAnswer } from "@/lib/schemas";

const DOC = [
  "1. RENT\nThe rent is Rs. 25,000 per month. Contact the owner at 9876543210.",
  "",
  "2. DEPOSIT\nThe security deposit of Rs. 1,50,000 shall be forfeited if the tenant leaves early.",
].join("\n");

const modelAnalysis: ModelAnalysis = {
  documentType: "Rental agreement",
  summary: "An 11-month rental.",
  keyTerms: [
    { label: "Rent", value: "Rs. 25,000", clauseId: "A" },
    { label: "Deposit", value: "Rs. 3,00,000", clauseId: "B" },
  ],
  risks: [
    {
      title: "Invented pet penalty",
      severity: "low",
      explanation: "x",
      whyItMattersToYou: "x",
      quote: "tenant shall pay a penalty for keeping pets",
      clauseId: "A",
      suggestedAction: "x",
    },
    {
      title: "Deposit forfeiture",
      severity: "high",
      explanation: "x",
      whyItMattersToYou: "x",
      quote: "shall be forfeited if the tenant leaves early",
      clauseId: "B",
      suggestedAction: "x",
    },
  ],
  missingProtections: [{ title: "Refund timeline", explanation: "x" }],
  lawyerQuestions: ["When is the deposit returned?"],
};

function fakeGenerator(output: unknown) {
  return vi.fn(async () => output) as unknown as StructuredGenerator & ReturnType<typeof vi.fn>;
}

describe("analyzeDocument", () => {
  it("never sends personal data to the model", async () => {
    const generate = fakeGenerator(modelAnalysis);
    const result = await analyzeDocument({ pages: [DOC], role: "tenant", concerns: [], language: "English" }, generate);

    const prompt = generate.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("9876543210");
    expect(prompt).toContain("[PHONE REDACTED]");
    expect(result.redactions).toEqual({ total: 1, counts: { PHONE: 1 } });
  });

  it("verifies quotes, flags hallucinations and sorts by severity", async () => {
    const result = await analyzeDocument(
      { pages: [DOC], role: "tenant", concerns: ["Deposit"], language: "English" },
      fakeGenerator(modelAnalysis),
    );

    expect(result.risks.map((r) => [r.title, r.verification.status])).toEqual([
      ["Deposit forfeiture", "verified"],
      ["Invented pet penalty", "unverified"],
    ]);
    expect(result.stats).toEqual({ verified: 1, approximate: 0, unverified: 1 });
  });

  it("verifies key terms even when the model echoes bracketed ids", async () => {
    const bracketed = {
      ...modelAnalysis,
      keyTerms: [{ label: "Rent", value: "Rs. 25,000", clauseId: "[A]" }],
      lawyerQuestions: ["Is the deposit rule ([B]) fair?"],
    };
    const result = await analyzeDocument(
      { pages: [DOC], role: "tenant", concerns: [], language: "English" },
      fakeGenerator(bracketed),
    );
    expect(result.keyTerms[0]).toMatchObject({ clauseId: "A", verification: "verified" });
    expect(result.lawyerQuestions[0]).toBe("Is the deposit rule (Clause 2) fair?");
  });

  it("verifies quotes the model prefixed with clause notation, and shows them clean", async () => {
    const prefixed = {
      ...modelAnalysis,
      risks: [{ ...modelAnalysis.risks[1], quote: "[B] shall be forfeited if the tenant leaves early" }],
    };
    const result = await analyzeDocument({ pages: [DOC], role: "tenant", concerns: [], language: "English" }, fakeGenerator(prefixed));
    expect(result.risks[0]).toMatchObject({
      quote: "shall be forfeited if the tenant leaves early",
      verification: { status: "verified", clauseId: "B" },
    });
  });

  it("catches altered figures in key terms", async () => {
    const result = await analyzeDocument(
      { pages: [DOC], role: "tenant", concerns: [], language: "English" },
      fakeGenerator(modelAnalysis),
    );
    expect(result.keyTerms.map((t) => t.verification)).toEqual(["verified", "unverified"]);
  });

  it("includes the user's role, concerns and language in the request", async () => {
    const generate = fakeGenerator(modelAnalysis);
    await analyzeDocument({ pages: [DOC], role: "tenant", concerns: ["Lock-in"], language: "Hindi" }, generate);
    const call = generate.mock.calls[0][0];
    expect(call.prompt).toContain("tenant");
    expect(call.prompt).toContain("Lock-in");
    expect(call.system).toContain("Hindi");
  });

  it("reports each real pipeline step with real numbers, in order", async () => {
    const events: string[] = [];
    await analyzeDocument({ pages: [DOC], role: "tenant", concerns: [], language: "English" }, fakeGenerator(modelAnalysis), (e) =>
      events.push(`${e.stage}:${e.status}:${e.detail}`),
    );
    expect(events).toEqual([
      "privacy:done:Hidden: phone number",
      "segment:done:2 clauses across 1 page",
      "reading:active:Sending clauses to Gemini",
      "reading:done:2 clauses flagged, 2 key terms found",
      "verify:done:1 of 2 quotes and 1 of 2 figures matched",
    ]);
  });

  it("surfaces model fallbacks as progress", async () => {
    const events: string[] = [];
    const generate = (async (options: Parameters<StructuredGenerator>[0]) => {
      options.onRetry?.({ model: "gemini-2.5-flash", nextModel: "gemini-3-flash-preview", kind: "quota" });
      return modelAnalysis;
    }) as StructuredGenerator;
    await analyzeDocument({ pages: [DOC], role: "tenant", concerns: [], language: "English" }, generate, (e) => events.push(e.detail));
    expect(events).toContain("gemini-2.5-flash has reached its usage limit, switching to gemini-3-flash-preview");
  });

  it("derives the verdict from verified findings, not a fixed message", async () => {
    const result = await analyzeDocument(
      { pages: [DOC], role: "tenant", concerns: [], language: "English" },
      fakeGenerator(modelAnalysis),
    );
    // One verified high risk; the invented low risk is unverified and cannot escalate.
    expect(result.verdict).toEqual({
      decision: "negotiate",
      reason: 'One high-risk clause is confirmed: "Deposit forfeiture". Ask for it to be changed before you sign.',
    });
  });

  it("rejects documents with no readable text", async () => {
    await expect(
      analyzeDocument({ pages: ["   "], role: "tenant", concerns: [], language: "English" }, fakeGenerator(modelAnalysis)),
    ).rejects.toThrow(/No readable text/);
  });
});

describe("answerQuestion", () => {
  const ask = (answer: ModelAnswer) =>
    answerQuestion({ pages: [DOC], role: "tenant", language: "English", question: "Is the deposit refundable?" }, fakeGenerator(answer));

  it("returns verified citations for grounded answers", async () => {
    const result = await ask({
      found: true,
      answer: "It can be forfeited.",
      citations: [{ quote: "security deposit of Rs. 1,50,000 shall be forfeited", clauseId: "B" }],
    });
    expect(result.ungrounded).toBe(false);
    expect(result.citations[0].verification).toEqual({ status: "verified", clauseId: "B" });
  });

  it("marks answers whose evidence cannot be found as ungrounded", async () => {
    const result = await ask({
      found: true,
      answer: "Yes, within 7 days.",
      citations: [{ quote: "deposit refunded within seven days of vacating", clauseId: "B" }],
    });
    expect(result.ungrounded).toBe(true);
  });

  it("passes through honest 'not in document' answers", async () => {
    const result = await ask({ found: false, answer: "The document does not say.", citations: [] });
    expect(result).toMatchObject({ found: false, ungrounded: false });
  });
});
