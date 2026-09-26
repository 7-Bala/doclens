/**
 * Evidence verification: every quote or figure the model returns is checked against
 * the source document with plain string logic. This is what turns "AI said so"
 * into "here is the exact line", and it is how hallucinated citations are caught.
 */
import type { Clause } from "./clauses";

export type VerificationStatus = "verified" | "approximate" | "unverified";

export interface Verification {
  status: VerificationStatus;
  /** The clause where the evidence was actually found (may differ from the model's claim). */
  clauseId: string | null;
}

/** Case-, whitespace-, quote- and dash-insensitive form used for matching. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛`]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[^\p{L}\p{N}'"\-%.,₹$/ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whitespace- and hyphen-free form. PDFs hard-wrap lines inside words and numbers
 * ("betwee n", "1,50, 000", "Licen- see"); the model quotes the healed text, so an exact
 * match must ignore where the line breaks happened to fall.
 */
export function compact(text: string): string {
  return normalize(text).replace(/[\s-]+/g, "");
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .map((t) => t.replace(/^[.,'"]+|[.,'"]+$/g, ""))
    .filter(Boolean);
}

/** Length of the longest common subsequence of two token lists (order-preserving overlap). */
function lcsLength(a: string[], b: string[]): number {
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = temp;
    }
  }
  return prev[b.length];
}

/** Share of quote tokens that appear, in order, inside the clause. */
export function overlapRatio(quote: string, clauseText: string): number {
  const q = tokens(quote);
  if (q.length === 0) return 0;
  return lcsLength(q, tokens(clauseText)) / q.length;
}

const APPROXIMATE_THRESHOLD = 0.8;
const MIN_QUOTE_TOKENS = 3;

export function verifyQuote(quote: string, claimedClauseId: string, clauses: Clause[]): Verification {
  const q = normalize(quote);
  if (tokens(quote).length < MIN_QUOTE_TOKENS) return { status: "unverified", clauseId: null };

  // Check the clause the model pointed at first, then the rest of the document.
  const ordered = [...clauses].sort((a, b) => Number(b.id === claimedClauseId) - Number(a.id === claimedClauseId));

  for (const clause of ordered) {
    if (normalize(clause.text).includes(q)) return { status: "verified", clauseId: clause.id };
  }
  const qCompact = compact(quote);
  for (const clause of ordered) {
    if (compact(clause.text).includes(qCompact)) return { status: "verified", clauseId: clause.id };
  }

  let best: { id: string; ratio: number } | null = null;
  for (const clause of ordered) {
    const ratio = overlapRatio(quote, clause.text);
    if (!best || ratio > best.ratio) best = { id: clause.id, ratio };
  }
  if (best && best.ratio >= APPROXIMATE_THRESHOLD) return { status: "approximate", clauseId: best.id };
  return { status: "unverified", clauseId: null };
}

/** Numbers as written in legal text: "50,000", "11", "2.5", "(2)". */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/**
 * A key term like "Rs. 50,000" is only trusted if every number in it exists in the
 * cited clause. Catches the classic failure where a model "rounds" or invents figures.
 */
export function verifyFigures(value: string, clauseId: string, clauses: Clause[]): VerificationStatus {
  const clause = clauses.find((c) => c.id === clauseId);
  if (!clause) return "unverified";
  const expected = numbersIn(value);
  if (expected.length === 0) {
    return overlapRatio(value, clause.text) >= APPROXIMATE_THRESHOLD ? "verified" : "approximate";
  }
  // Union with the compact form so a figure split by a line wrap ("1,50, 000") still counts.
  const available = new Set([...numbersIn(clause.text), ...numbersIn(compact(clause.text))]);
  return expected.every((n) => available.has(n)) ? "verified" : "unverified";
}
