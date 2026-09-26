/**
 * Removes personal identifiers before any text leaves the server for the LLM.
 * Redaction is deterministic so the same document always yields the same prompt
 * (which also keeps the analysis cache effective).
 */

interface RedactionRule {
  kind: string;
  pattern: RegExp;
}

// Order matters: more specific patterns run first so they are not swallowed by generic ones.
const RULES: RedactionRule[] = [
  { kind: "EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "PAN", pattern: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  { kind: "AADHAAR", pattern: /\b[2-9][0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g },
  { kind: "IFSC", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { kind: "PHONE", pattern: /(?:\+91[\s-]?|\b0)?\b[6-9][0-9]{4}[\s-]?[0-9]{5}\b/g },
  // Long digit runs (bank accounts, card numbers). Amounts use separators, so they are unaffected.
  { kind: "ACCOUNT", pattern: /\b[0-9]{11,18}\b/g },
];

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
  total: number;
}

// A numbered clause heading at the start of a line ("6. TERMINATION", "(a) ...") must never be merged.
const HEADING_START = /^\(?[0-9]{1,2}(?:\.[0-9]{1,2})*[.)]\s|^\([a-z]\)\s/i;

/**
 * Re-joins identifiers that a PDF line wrap split in two, so they can be redacted whole.
 * Without this, "ramesh.\nkumar@example.com" would leak "ramesh." to the model.
 */
export function healWrappedIdentifiers(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (prev !== undefined && prev.length > 0 && line.length > 0) {
      const prevToken = /[^\s]*$/.exec(prev)?.[0] ?? "";
      const nextToken = /^[^\s]*/.exec(line)?.[0] ?? "";
      const emailSplit = /^[\w.%+-]+$/.test(prevToken) && prevToken.length > 0 && (prevToken.includes("@") || nextToken.includes("@"));
      const digitSplit = /[0-9]$/.test(prev) && /^[0-9]/.test(line) && !HEADING_START.test(line);
      if (emailSplit || digitSplit) {
        out[out.length - 1] = prev + line;
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

export function redact(input: string): RedactionResult {
  const counts: Record<string, number> = {};
  let text = healWrappedIdentifiers(input);
  for (const { kind, pattern } of RULES) {
    text = text.replace(pattern, () => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      return `[${kind} REDACTED]`;
    });
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { text, counts, total };
}
