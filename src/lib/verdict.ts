import type { Severity } from "./schemas";
import type { VerificationStatus } from "./verify";

export type Decision = "sign" | "negotiate" | "consult";

export interface Verdict {
  decision: Decision;
  /** One sentence shown under the verdict badge, explaining the decision with specifics. */
  reason: string;
}

/** The subset of a risk the verdict needs: its title, how bad it is, and whether its evidence checked out. */
export interface VerdictInput {
  title: string;
  severity: Severity;
  verification: VerificationStatus;
}

/** Thresholds are named so the policy reads as a rulebook and tests can reference it. */
export const POLICY = {
  /** This many confirmed high risks means the user needs a professional, not just a negotiation. */
  consultHighRisks: 2,
  /** One confirmed high risk plus this many confirmed medium risks is also too much to negotiate alone. */
  consultMediumWithOneHigh: 3,
  /** A document with no risky clauses but this many missing safeguards still deserves pushback. */
  negotiateMissingProtections: 3,
} as const;

function listTitles(risks: VerdictInput[], max = 2): string {
  const titles = risks.slice(0, max).map((r) => `"${r.title}"`);
  const more = risks.length - titles.length;
  return more > 0 ? `${titles.join(", ")} and ${more} more` : titles.join(" and ");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Turns verified findings into one recommendation: Sign / Negotiate / Consult a lawyer.
 *
 * Deterministic on purpose: the same findings always give the same verdict, and every
 * verdict is explainable. The policy is conservative, because wrongly saying "sign" is far
 * more harmful than wrongly saying "negotiate":
 *  - Only risks whose quote was found in the document (verified or close match) can escalate
 *    to "consult". Unverified risks cannot be trusted enough to escalate, but they also block
 *    a "sign" verdict, since the user must check them by hand.
 *  - Any confirmed high or medium risk means the user should at least negotiate.
 *  - "Sign" is reserved for documents with only low risks and few missing safeguards.
 */
export function computeVerdict(risks: VerdictInput[], missingProtections: number): Verdict {
  const confirmed = risks.filter((r) => r.verification !== "unverified");
  const unverified = risks.filter((r) => r.verification === "unverified");
  const high = confirmed.filter((r) => r.severity === "high");
  const medium = confirmed.filter((r) => r.severity === "medium");

  if (high.length >= POLICY.consultHighRisks) {
    return {
      decision: "consult",
      reason: `${plural(high.length, "high-risk clause")} confirmed in your document, including ${listTitles(high)}. Get professional advice before signing.`,
    };
  }
  if (high.length === 1 && medium.length >= POLICY.consultMediumWithOneHigh) {
    return {
      decision: "consult",
      reason: `${listTitles(high)} is high risk, and ${plural(medium.length, "more clause")} work against you. Together they are worth a lawyer's review.`,
    };
  }
  if (high.length === 1) {
    return {
      decision: "negotiate",
      reason: `One high-risk clause is confirmed: ${listTitles(high)}. Ask for it to be changed before you sign.`,
    };
  }
  if (medium.length > 0) {
    return {
      decision: "negotiate",
      reason: `${plural(medium.length, "clause")} ${medium.length === 1 ? "works" : "work"} against you, including ${listTitles(medium)}. Negotiate these before signing.`,
    };
  }
  if (unverified.length > 0) {
    return {
      decision: "negotiate",
      reason: `${plural(unverified.length, "concern")} could not be matched to your document's wording. Read ${unverified.length === 1 ? "it" : "them"} yourself before signing.`,
    };
  }
  if (missingProtections >= POLICY.negotiateMissingProtections) {
    return {
      decision: "negotiate",
      reason: `No harmful clauses were found, but ${plural(missingProtections, "standard protection")} ${missingProtections === 1 ? "is" : "are"} missing. Ask for them to be added.`,
    };
  }
  const low = confirmed.length;
  return {
    decision: "sign",
    reason:
      low > 0
        ? `Only ${plural(low, "minor point")} to be aware of, and nothing that works strongly against you.`
        : "No clauses were found that work against you for your concerns.",
  };
}
