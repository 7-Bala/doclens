/**
 * Splits a document into addressable clauses so the model can cite them by id
 * and the UI can jump to them. Pure and deterministic.
 */

export interface Clause {
  /**
   * Stable id used in prompts and citations: letters ("A", "B", … "AA"). Deliberately not
   * numeric, so a model cannot confuse it with the document's own "Clause 4" numbering.
   */
  id: string;
  /** Human label: the document's own numbering when present ("Clause 5.2"), else "Paragraph n". */
  label: string;
  text: string;
  /** 1-based page number from the source PDF (always 1 for pasted text). */
  page: number;
}

// "1.", "5.2", "12)", "(a)", "a)", "Clause 7", "Section 3.1", "Article IV"
const HEADING_RE =
  /^\s*(?:(?:clause|section|article)\s+([0-9]+(?:\.[0-9]+)*|[IVXLC]+)\b|\(?([0-9]{1,2}(?:\.[0-9]{1,2})*)[.)]\s|\(([a-z])\)\s)/i;

const MAX_CLAUSE_CHARS = 1_500;

function labelFor(line: string): string | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  const num = m[1] ?? m[2] ?? m[3];
  return `Clause ${num}`;
}

/** Break very long blocks on sentence boundaries so citations stay precise. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_CLAUSE_CHARS) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const parts: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > MAX_CLAUSE_CHARS && current) {
      parts.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** 1 -> "A", 26 -> "Z", 27 -> "AA" (bijective base-26). */
export function letterId(n: number): string {
  let id = "";
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    id = String.fromCharCode(65 + ((rest - 1) % 26)) + id;
  }
  return id;
}

export function segmentClauses(pages: string[]): Clause[] {
  const blocks: { label: string | null; text: string; page: number }[] = [];

  pages.forEach((pageText, pageIndex) => {
    const page = pageIndex + 1;
    let current: { label: string | null; lines: string[] } | null = null;

    const flush = () => {
      if (current && current.lines.join(" ").trim()) {
        blocks.push({ label: current.label, text: current.lines.join(" ").replace(/\s+/g, " ").trim(), page });
      }
      current = null;
    };

    for (const rawLine of pageText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        flush();
        continue;
      }
      const label = labelFor(line);
      if (label || !current) {
        flush();
        current = { label, lines: [line] };
      } else {
        current.lines.push(line);
      }
    }
    flush();
  });

  const clauses: Clause[] = [];
  let paragraph = 0;
  for (const block of blocks) {
    const parts = splitLong(block.text);
    parts.forEach((text, i) => {
      paragraph += block.label ? 0 : 1;
      const base = block.label ?? `Paragraph ${paragraph}`;
      clauses.push({
        id: letterId(clauses.length + 1),
        label: parts.length > 1 ? `${base} (part ${i + 1})` : base,
        text,
        page: block.page,
      });
    });
  }
  return clauses;
}

/** Renders clauses for the prompt: "[C] (Clause 2, p.1) text". */
export function formatClausesForPrompt(clauses: Clause[]): string {
  return clauses.map((c) => `[${c.id}] (${c.label}, p.${c.page}) ${c.text}`).join("\n");
}

/**
 * Models sometimes echo the prompt notation back ("[B]", " b ") instead of the bare id.
 * Normalising at the boundary makes every downstream lookup exact.
 */
export function normalizeClauseId(id: string): string {
  return id.replace(/[[\]\s]/g, "").toUpperCase();
}

/**
 * Models sometimes prefix a quote with the prompt's clause notation, e.g. "[F] The deposit…"
 * or "(Clause 4, p.1) The deposit…". Those prefixes are not document text: strip them so the
 * quote can be verified word for word and shown cleanly.
 */
export function stripCitationPrefix(quote: string): string {
  let q = quote.trim();
  for (let previous = ""; previous !== q; ) {
    previous = q;
    q = q
      .replace(/^\[\s*[A-Z]{1,3}\s*\]\s*[:.-]?\s*/i, "")
      .replace(/^\(\s*(?:clause|paragraph|section|article)\b[^)]*\)\s*[:.-]?\s*/i, "")
      .trim();
  }
  return q;
}

/**
 * Internal ids like "[F]" mean nothing to users, who see "Clause 4" in the document viewer.
 * Rewrites every bracketed id in free text to its human label (or drops unknown ones).
 */
export function humanizeClauseRefs(text: string, clauses: Clause[]): string {
  const labels = new Map(clauses.map((c) => [c.id, c.label]));
  return text
    .replace(/\[\s*([A-Z]{1,3})\s*\]/gi, (_, id: string) => labels.get(id.toUpperCase()) ?? "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
