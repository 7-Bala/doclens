"use client";

import { useEffect, useRef } from "react";
import type { Clause } from "@/lib/clauses";
import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/schemas";
import { LockKey } from "./icons";

const SEVERITY_EDGE: Record<Severity, string> = {
  high: "border-high",
  medium: "border-medium",
  low: "border-low/60",
};

interface Props {
  clauses: Clause[];
  activeClauseId: string | null;
  /** Changes on every locate request, so locating the same clause twice scrolls again. */
  locateNonce: number;
  /** Highest severity flagged in each clause. */
  flagged: Map<string, Severity>;
  redactedCount: number;
  /** Jump from a flagged clause back to its finding. */
  onSelectFlagged: (clauseId: string) => void;
}

/** Renders "[PHONE REDACTED]" markers as quiet inline marks, so redaction reads as deliberate. */
function withRedactionMarks(text: string) {
  return text.split(/(\[[A-Z]+ REDACTED\])/g).map((part, i) => {
    const match = /^\[([A-Z]+) REDACTED\]$/.exec(part);
    if (!match) return part;
    return (
      <span key={i} className="mx-0.5 inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 align-baseline font-mono text-[11px] text-muted">
        <LockKey size={10} weight="fill" aria-hidden="true" />
        {match[1].toLowerCase()} hidden
      </span>
    );
  });
}

/** The user's contract rendered as paper, with flagged clauses marked and the located clause highlighted. */
export function DocumentView({ clauses, activeClauseId, locateNonce, flagged, redactedCount, onSelectFlagged }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!activeClauseId || !container) return;
    const el = container.querySelector<HTMLElement>(`[data-clause="${activeClauseId}"]`);
    if (!el) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    // Scroll only this pane. scrollIntoView would also scroll the window and cancel any
    // page scroll already in flight (e.g. jumping to the finding for this clause).
    container.scrollTo({ top: el.offsetTop - (container.clientHeight - el.offsetHeight) / 2, behavior });
    // On small screens the pane sits below the findings; bring it on screen only if it is not.
    const rect = container.getBoundingClientRect();
    if (rect.bottom < 80 || rect.top > window.innerHeight) container.scrollIntoView({ behavior, block: "nearest" });
    el.focus({ preventScroll: true });
  }, [activeClauseId, locateNonce]);

  return (
    <section aria-labelledby="doc-heading" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
        <div>
          <h2 id="doc-heading" className="font-semibold text-text">
            Your document
          </h2>
          <p className="text-xs text-muted">Select a marked clause to see why it was flagged.</p>
        </div>
        {redactedCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
            <LockKey size={13} weight="fill" aria-hidden="true" />
            <span className="font-mono tabular-nums">{redactedCount}</span> hidden
          </span>
        )}
      </div>

      <div ref={scrollRef} className="relative max-h-[70dvh] min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:max-h-none">
        {clauses.map((clause) => {
          const severity = flagged.get(clause.id);
          const active = clause.id === activeClauseId;
          const body = (
            <>
              <span className="mb-0.5 block font-sans font-mono text-[11px] text-faint">
                {clause.label} · p.{clause.page}
              </span>
              {withRedactionMarks(clause.text)}
            </>
          );
          const base = cn(
            "block w-full rounded-md border-l-2 px-3 py-2 text-left font-serif text-[15px] leading-relaxed transition-colors duration-200",
            active ? "border-highlight-line bg-highlight text-text" : severity ? cn(SEVERITY_EDGE[severity], "text-text") : "border-transparent text-muted",
          );
          return severity ? (
            <button
              key={clause.id}
              type="button"
              data-clause={clause.id}
              onClick={() => onSelectFlagged(clause.id)}
              aria-current={active ? "true" : undefined}
              aria-label={`${clause.label}, flagged ${severity} risk. Show finding.`}
              className={cn(base, "cursor-pointer", !active && "hover:bg-surface-2")}
            >
              {body}
            </button>
          ) : (
            <p key={clause.id} data-clause={clause.id} tabIndex={-1} aria-current={active ? "true" : undefined} className={base}>
              {body}
            </p>
          );
        })}
      </div>
    </section>
  );
}
