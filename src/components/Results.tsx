"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import type { Analysis, VerifiedRisk } from "@/lib/analyze";
import { buildLawyerBrief } from "@/lib/brief";
import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/schemas";
import type { Decision } from "@/lib/verdict";
import { SeverityBadge, VerificationBadge } from "./Badges";
import { Crosshair, DownloadSimple, Handshake, Scales, SealCheck, Warning, WarningOctagon } from "./icons";
import { Button } from "./ui/Button";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const DECISIONS = {
  sign: { title: "Reasonable to sign", Icon: SealCheck, tone: "border-ok text-ok" },
  negotiate: { title: "Negotiate before you sign", Icon: Warning, tone: "border-medium text-medium" },
  consult: { title: "Talk to a lawyer first", Icon: WarningOctagon, tone: "border-high text-high" },
} satisfies Record<Decision, unknown>;

interface Props {
  analysis: Analysis;
  activeClauseId: string | null;
  onLocate: (clauseId: string) => void;
}

export function Section({ id, eyebrow, title, action, children }: { id: string; eyebrow: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase text-faint">{eyebrow}</p>
          <h2 id={id} className="mt-1 text-xl font-semibold text-text text-balance">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LocateButton({ clauseId, label, onLocate }: { clauseId: string | null; label: string; onLocate: Props["onLocate"] }) {
  if (!clauseId) return null;
  return (
    <button
      type="button"
      onClick={() => onLocate(clauseId)}
      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink hover:bg-surface-2 lg:min-h-9"
    >
      <Crosshair size={16} aria-hidden="true" />
      {label}
    </button>
  );
}

function Verdict({ analysis }: { analysis: Analysis }) {
  const { title, Icon, tone } = DECISIONS[analysis.verdict.decision];
  const { stats, redactions, risks } = analysis;
  return (
    <section aria-labelledby="verdict-heading" className={cn("border-l-4 pl-5 sm:pl-6", tone)}>
      <p className="font-mono text-xs uppercase text-faint">Recommendation</p>
      <h2 id="verdict-heading" className="mt-1 flex items-start gap-2.5 text-2xl font-semibold leading-tight text-balance sm:text-3xl">
        <Icon weight="fill" className="mt-0.5 size-7 shrink-0 sm:size-8" aria-hidden="true" />
        {title}
      </h2>
      <p className="mt-2 max-w-[65ch] text-text text-pretty">{analysis.verdict.reason}</p>
      <p className="mt-4 max-w-[65ch] leading-relaxed text-muted text-pretty">
        <span className="font-medium text-text">{analysis.documentType}.</span> {analysis.summary}
      </p>
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-muted">Clauses to watch</dt>
          <dd className="font-mono text-lg text-text tabular-nums">{risks.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Verified word for word</dt>
          <dd className="font-mono text-lg text-ok tabular-nums">
            {stats.verified}/{risks.length}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Personal details hidden</dt>
          <dd className="font-mono text-lg text-text tabular-nums">{redactions.total}</dd>
        </div>
      </dl>
    </section>
  );
}

function KeyTerms({ analysis, onLocate }: Omit<Props, "activeClauseId">) {
  const known = new Set(analysis.clauses.map((c) => c.id));
  return (
    <Section id="terms-heading" eyebrow="At a glance" title="Key terms">
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
        {analysis.keyTerms.map((t) => (
          <div key={`${t.label}-${t.clauseId}`} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-center sm:gap-4">
            <dt className="text-sm text-muted">{t.label}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium text-text tabular-nums">
              {t.value}
              {t.verification === "unverified" && <VerificationBadge status="unverified" compact />}
            </dd>
            <dd>
              {known.has(t.clauseId) && (
                <button
                  type="button"
                  onClick={() => onLocate(t.clauseId)}
                  aria-label={`Show ${t.label} in document`}
                  className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-ink lg:size-9"
                >
                  <Crosshair size={17} aria-hidden="true" />
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

type Filter = "all" | Severity;

function Finding({ risk, clauseLabel, active, onLocate }: { risk: VerifiedRisk; clauseLabel?: string; active: boolean; onLocate: Props["onLocate"] }) {
  const trusted = risk.verification.status !== "unverified";
  return (
    <article
      id={risk.verification.clauseId ? `finding-${risk.verification.clauseId}` : undefined}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-surface p-5 transition-[border-color,box-shadow] duration-200",
        active ? "border-highlight-line shadow-[0_0_0_3px_var(--highlight)]" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SeverityBadge severity={risk.severity} />
        <VerificationBadge status={risk.verification.status} />
        {clauseLabel && <span className="font-mono text-xs text-faint">{clauseLabel}</span>}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-text text-balance">{risk.title}</h3>
      <p className="mt-2 text-text text-pretty">
        <span className="font-medium">For you: </span>
        {risk.whyItMattersToYou}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">{risk.explanation}</p>
      <blockquote
        className={cn(
          "mt-4 border-l-2 py-1 pl-4 font-serif text-[15px] leading-relaxed text-text",
          trusted ? "border-highlight-line" : "border-high/50 text-muted",
        )}
      >
        {risk.quote}
      </blockquote>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
        <p className="flex max-w-[60ch] items-start gap-2 text-sm text-text text-pretty">
          <Handshake size={18} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
          <span>
            <span className="font-medium">Ask for: </span>
            {risk.suggestedAction}
          </span>
        </p>
        <LocateButton clauseId={risk.verification.clauseId} label="Show in document" onLocate={onLocate} />
      </div>
    </article>
  );
}

function Findings({ analysis, activeClauseId, onLocate }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const labels = new Map(analysis.clauses.map((c) => [c.id, c.label]));
  const counts = { all: analysis.risks.length, high: 0, medium: 0, low: 0 };
  for (const r of analysis.risks) counts[r.severity] += 1;
  const visible = analysis.risks.filter((r) => filter === "all" || r.severity === filter);
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  return (
    <Section
      id="risks-heading"
      eyebrow="Ranked by your concerns"
      title="Clauses to watch"
      action={
        analysis.risks.length > 0 && (
          <div role="group" aria-label="Filter by severity" className="flex rounded-lg border border-line bg-surface p-1">
            {filters
              .filter((f) => f.value === "all" || counts[f.value] > 0)
              .map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "min-h-9 cursor-pointer rounded-md px-3 text-sm transition-colors duration-150",
                    filter === f.value ? "bg-ink text-ink-contrast" : "text-muted hover:text-text",
                  )}
                >
                  {f.label} <span className="font-mono tabular-nums opacity-75">{counts[f.value]}</span>
                </button>
              ))}
          </div>
        )
      }
    >
      {analysis.risks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong p-8 text-center">
          <SealCheck size={28} weight="fill" className="mx-auto text-ok" aria-hidden="true" />
          <p className="mt-3 font-medium text-text">Nothing in this document stood out as risky for you.</p>
          <p className="mt-1 text-sm text-muted">Still skim the key terms above, and ask a question below if anything is unclear.</p>
        </div>
      ) : (
        <motion.ol layout className="grid gap-4">
          <AnimatePresence initial={true} mode="popLayout">
            {visible.map((risk, i) => (
              <motion.li
                key={`${risk.title}-${risk.quote.slice(0, 24)}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.05, ease: EASE_OUT }}
              >
                <Finding
                  risk={risk}
                  clauseLabel={risk.verification.clauseId ? labels.get(risk.verification.clauseId) : undefined}
                  active={risk.verification.clauseId === activeClauseId}
                  onLocate={onLocate}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ol>
      )}
    </Section>
  );
}

export function Results({ analysis, activeClauseId, onLocate }: Props) {
  function downloadBrief() {
    const blob = new Blob([buildLawyerBrief(analysis)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "doclens-brief.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-10">
      <Verdict analysis={analysis} />
      <KeyTerms analysis={analysis} onLocate={onLocate} />
      <Findings analysis={analysis} activeClauseId={activeClauseId} onLocate={onLocate} />

      {analysis.missingProtections.length > 0 && (
        <Section id="missing-heading" eyebrow="What is not there" title="Protections this document leaves out">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {analysis.missingProtections.map((m) => (
              <li key={m.title} className="px-4 py-3.5">
                <p className="font-medium text-text">{m.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">{m.explanation}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        id="questions-heading"
        eyebrow="Before you sign"
        title="Questions to ask"
        action={
          <Button onClick={downloadBrief}>
            <DownloadSimple size={17} aria-hidden="true" />
            Download lawyer brief
          </Button>
        }
      >
        <ol className="grid gap-3">
          {analysis.lawyerQuestions.map((q, i) => (
            <li key={q} className="grid grid-cols-[2rem_1fr] items-baseline text-text">
              <span className="font-mono text-sm text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-pretty">{q}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex items-start gap-2 text-sm text-muted">
          <Scales size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          The brief bundles these questions with each clause and its exact wording, ready for a lawyer or the other party.
        </p>
      </Section>
    </div>
  );
}
