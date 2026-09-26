import type { z } from "zod";
import {
  formatClausesForPrompt,
  humanizeClauseRefs,
  normalizeClauseId,
  segmentClauses,
  stripCitationPrefix,
  type Clause,
} from "./clauses";
import { redact } from "./redact";
import type { FailureKind } from "./retry";
import { verifyFigures, verifyQuote, type Verification, type VerificationStatus } from "./verify";
import { computeVerdict, type Verdict } from "./verdict";
import { analysisSystemPrompt, buildAnalysisPrompt, buildAskPrompt } from "./prompts";
import {
  modelAnalysisSchema,
  modelAnswerSchema,
  type AnalyzeRequest,
  type AskRequest,
  type ModelAnalysis,
  type Severity,
} from "./schemas";

/** The model call is injected so the pipeline can be tested without network access. */
export type StructuredGenerator = <T extends z.ZodType>(options: {
  schema: T;
  system: string;
  prompt: string;
  /** Called when a model is overloaded and the request moves to a retry or backup model. */
  onRetry?: (info: { model: string; nextModel: string | null; kind: FailureKind }) => void;
}) => Promise<z.infer<T>>;

const FAILURE_TEXT: Record<FailureKind, string> = {
  overload: "is busy",
  timeout: "is taking too long",
  quota: "has reached its usage limit",
  unavailable: "is unavailable",
  fatal: "failed",
};

export type ProgressStage = "privacy" | "segment" | "reading" | "verify";

/** Emitted as each pipeline step really completes, so the UI never shows fake progress. */
export interface ProgressEvent {
  stage: ProgressStage;
  status: "active" | "done";
  detail: string;
}

const REDACTION_NAMES: Record<string, string> = {
  PHONE: "phone number",
  EMAIL: "email",
  PAN: "PAN",
  AADHAAR: "Aadhaar number",
  IFSC: "IFSC code",
  ACCOUNT: "account number",
};

function describeRedactions(counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([kind, n]) => {
    const name = REDACTION_NAMES[kind] ?? kind.toLowerCase();
    return n === 1 ? name : `${n} ${name}s`;
  });
  return parts.length ? `Hidden: ${parts.join(", ")}` : "No phone numbers, emails or ID numbers found";
}

export interface VerifiedRisk extends Omit<ModelAnalysis["risks"][number], "clauseId"> {
  verification: Verification;
}

export interface Analysis {
  documentType: string;
  summary: string;
  keyTerms: (ModelAnalysis["keyTerms"][number] & { verification: VerificationStatus })[];
  risks: VerifiedRisk[];
  missingProtections: ModelAnalysis["missingProtections"];
  lawyerQuestions: string[];
  verdict: Verdict;
  clauses: Clause[];
  redactions: { total: number; counts: Record<string, number> };
  stats: { verified: number; approximate: number; unverified: number };
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER: Record<VerificationStatus, number> = { verified: 0, approximate: 1, unverified: 2 };

/** Shared first step: strip personal data, then split into citable clauses. */
export function prepareDocument(pages: string[]) {
  const redactedPages = pages.map((p) => redact(p));
  const counts: Record<string, number> = {};
  for (const r of redactedPages) {
    for (const [kind, n] of Object.entries(r.counts)) counts[kind] = (counts[kind] ?? 0) + n;
  }
  const clauses = segmentClauses(redactedPages.map((r) => r.text));
  return {
    clauses,
    clausesText: formatClausesForPrompt(clauses),
    redactions: { total: redactedPages.reduce((s, r) => s + r.total, 0), counts },
  };
}

export async function analyzeDocument(
  request: AnalyzeRequest,
  generate: StructuredGenerator,
  onProgress: (event: ProgressEvent) => void = () => {},
): Promise<Analysis> {
  const { clauses, clausesText, redactions } = prepareDocument(request.pages);
  onProgress({ stage: "privacy", status: "done", detail: describeRedactions(redactions.counts) });
  if (clauses.length === 0) throw new Error("No readable text found in the document.");
  const pageCount = new Set(clauses.map((c) => c.page)).size;
  onProgress({
    stage: "segment",
    status: "done",
    detail: `${clauses.length} clauses across ${pageCount} page${pageCount === 1 ? "" : "s"}`,
  });

  onProgress({ stage: "reading", status: "active", detail: "Sending clauses to Gemini" });
  const model = await generate({
    schema: modelAnalysisSchema,
    system: analysisSystemPrompt(request.language),
    prompt: buildAnalysisPrompt({ role: request.role, concerns: request.concerns, clausesText }),
    onRetry: ({ model, nextModel, kind }) =>
      onProgress({
        stage: "reading",
        status: "active",
        detail: `${model} ${FAILURE_TEXT[kind]}, ${nextModel === model ? "retrying" : `switching to ${nextModel}`}`,
      }),
  });
  onProgress({
    stage: "reading",
    status: "done",
    detail: `${model.risks.length} clause${model.risks.length === 1 ? "" : "s"} flagged, ${model.keyTerms.length} key terms found`,
  });

  const human = (text: string) => humanizeClauseRefs(text, clauses);

  const risks: VerifiedRisk[] = model.risks
    .map(({ clauseId, ...risk }) => ({
      ...risk,
      quote: stripCitationPrefix(risk.quote),
      explanation: human(risk.explanation),
      whyItMattersToYou: human(risk.whyItMattersToYou),
      suggestedAction: human(risk.suggestedAction),
      verification: verifyQuote(stripCitationPrefix(risk.quote), normalizeClauseId(clauseId), clauses),
    }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        STATUS_ORDER[a.verification.status] - STATUS_ORDER[b.verification.status],
    );

  const keyTerms = model.keyTerms.map((term) => {
    const clauseId = normalizeClauseId(term.clauseId);
    return { ...term, clauseId, verification: verifyFigures(term.value, clauseId, clauses) };
  });

  const stats = { verified: 0, approximate: 0, unverified: 0 };
  for (const r of risks) stats[r.verification.status] += 1;
  const termsVerified = keyTerms.filter((t) => t.verification === "verified").length;
  onProgress({
    stage: "verify",
    status: "done",
    detail: `${stats.verified + stats.approximate} of ${risks.length} quotes and ${termsVerified} of ${keyTerms.length} figures matched`,
  });

  return {
    documentType: model.documentType,
    summary: human(model.summary),
    keyTerms,
    risks,
    missingProtections: model.missingProtections.map((m) => ({ ...m, explanation: human(m.explanation) })),
    lawyerQuestions: model.lawyerQuestions.map(human),
    verdict: computeVerdict(
      risks.map((r) => ({ title: r.title, severity: r.severity, verification: r.verification.status })),
      model.missingProtections.length,
    ),
    clauses,
    redactions,
    stats,
  };
}

export interface Answer {
  found: boolean;
  answer: string;
  citations: { quote: string; verification: Verification }[];
  /** True when the model claimed an answer but none of its evidence exists in the document. */
  ungrounded: boolean;
}

export async function answerQuestion(request: AskRequest, generate: StructuredGenerator): Promise<Answer> {
  const { clauses, clausesText } = prepareDocument(request.pages);
  const model = await generate({
    schema: modelAnswerSchema,
    system: analysisSystemPrompt(request.language),
    prompt: buildAskPrompt({ role: request.role, question: request.question, clausesText }),
  });

  const citations = model.citations.map((c) => {
    const quote = stripCitationPrefix(c.quote);
    return { quote, verification: verifyQuote(quote, normalizeClauseId(c.clauseId), clauses) };
  });
  const grounded = citations.some((c) => c.verification.status !== "unverified");

  return {
    found: model.found,
    answer: humanizeClauseRefs(model.answer, clauses),
    citations,
    ungrounded: model.found && !grounded,
  };
}
