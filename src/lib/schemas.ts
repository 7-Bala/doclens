import { z } from "zod";

/** Limits keep requests cheap and protect the server from abuse. */
export const LIMITS = {
  maxDocumentChars: 60_000,
  maxQuestionChars: 500,
  maxConcerns: 6,
  maxPdfBytes: 5 * 1024 * 1024,
} as const;

export const ROLES = ["tenant", "employee", "freelancer", "consumer", "other"] as const;
export const LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Bengali", "Marathi"] as const;
export const SEVERITIES = ["high", "medium", "low"] as const;

export type Role = (typeof ROLES)[number];
export type Language = (typeof LANGUAGES)[number];
export type Severity = (typeof SEVERITIES)[number];

/* ------------------------------------------------------------------ */
/* Request schemas (validated at the API boundary)                     */
/* ------------------------------------------------------------------ */

const pagesSchema = z
  .array(z.string())
  .min(1, "Document is empty")
  .max(200)
  .refine((pages) => pages.join("").trim().length > 0, "Document is empty")
  .refine(
    (pages) => pages.join("").length <= LIMITS.maxDocumentChars,
    `Document is too long (max ${LIMITS.maxDocumentChars.toLocaleString()} characters)`,
  );

export const analyzeRequestSchema = z.object({
  pages: pagesSchema,
  role: z.enum(ROLES),
  concerns: z.array(z.string().trim().min(1).max(60)).max(LIMITS.maxConcerns).default([]),
  language: z.enum(LANGUAGES).default("English"),
});
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export const askRequestSchema = z.object({
  pages: pagesSchema,
  role: z.enum(ROLES),
  language: z.enum(LANGUAGES).default("English"),
  question: z.string().trim().min(3, "Question is too short").max(LIMITS.maxQuestionChars),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/* ------------------------------------------------------------------ */
/* Model output schemas (sent to Gemini as JSON Schema, then re-checked) */
/* ------------------------------------------------------------------ */

export const modelAnalysisSchema = z.object({
  documentType: z.string().describe("Short name of the document type, e.g. 'Residential rental agreement'"),
  summary: z.string().describe("2-3 plain-language sentences on what this document means for the user"),
  keyTerms: z
    .array(
      z.object({
        label: z.string().describe("e.g. 'Security deposit', 'Lock-in period', 'Notice period'"),
        value: z.string().describe("The value exactly as stated in the document, e.g. 'Rs. 50,000'"),
        clauseId: z.string().describe("The bracketed id of the clause this came from, e.g. F"),
      }),
    )
    .max(12),
  risks: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(SEVERITIES),
        explanation: z.string().describe("What the clause means, in plain language"),
        whyItMattersToYou: z.string().describe("The concrete consequence for this user's role and concerns"),
        quote: z.string().describe("Exact verbatim excerpt from the clause (copy, do not paraphrase), max ~40 words"),
        clauseId: z.string(),
        suggestedAction: z.string().describe("What the user could ask for or negotiate"),
      }),
    )
    .max(10),
  missingProtections: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string().describe("Why a fair document usually includes this and why its absence matters"),
      }),
    )
    .max(6),
  lawyerQuestions: z.array(z.string()).max(8),
});
export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;

export const modelAnswerSchema = z.object({
  found: z.boolean().describe("false if the document does not contain the answer"),
  answer: z.string(),
  citations: z
    .array(z.object({ quote: z.string(), clauseId: z.string() }))
    .max(4),
});
export type ModelAnswer = z.infer<typeof modelAnswerSchema>;
