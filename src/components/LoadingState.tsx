"use client";

import { useEffect, useState } from "react";
import type { ProgressEvent, ProgressStage } from "@/lib/analyze";
import { cn } from "@/lib/cn";
import { Check } from "./icons";

export type ProgressMap = Partial<Record<ProgressStage, Omit<ProgressEvent, "stage">>>;

const STAGES: { stage: ProgressStage; label: (role: string) => string }[] = [
  { stage: "privacy", label: () => "Hiding phone numbers, emails and ID numbers" },
  { stage: "segment", label: () => "Splitting the document into clauses" },
  { stage: "reading", label: (role) => `Reading it from ${/^[aeiou]/i.test(role) ? "an" : "a"} ${role}'s point of view` },
  { stage: "verify", label: () => "Checking every quote against your text" },
];

function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-3 animate-pulse rounded-full bg-surface-2", className)} />;
}

/** Real elapsed time since the request started, so the wait is honest rather than estimated. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{seconds}s</span>;
}

/**
 * Every row reflects an event the server sent when that step actually finished.
 * The first stage that is not yet done is shown as the one in progress.
 */
export function LoadingState({ role, progress }: { role: string; progress: ProgressMap }) {
  const firstPending = STAGES.findIndex((s) => progress[s.stage]?.status !== "done");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <p className="text-sm text-muted">
          Working for <Elapsed />
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-text text-balance">
          Reading your document as {/^[aeiou]/i.test(role) ? "an" : "a"} {role}
        </h2>
        <ol className="mt-6 grid gap-5" aria-label="Progress" aria-live="polite">
          {STAGES.map((s, i) => {
            const event = progress[s.stage];
            const done = event?.status === "done";
            const active = i === firstPending;
            return (
              <li key={s.stage} className="flex items-start gap-3 text-sm" aria-current={active ? "step" : undefined}>
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                    done && "border-ok bg-ok text-surface",
                    active && "border-ink",
                    !done && !active && "border-line",
                  )}
                >
                  {done ? (
                    <Check size={13} weight="bold" aria-hidden="true" />
                  ) : active ? (
                    <span className="size-2 animate-pulse rounded-full bg-ink" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className={cn("block", done || active ? "text-text" : "text-faint")}>
                    {s.label(role)}
                    <span className="sr-only">{done ? " (done)" : active ? " (in progress)" : ""}</span>
                  </span>
                  {event?.detail && <span className="mt-0.5 block text-xs text-muted">{event.detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div aria-hidden="true" className="grid gap-4 rounded-2xl border border-line bg-surface p-6">
        <Bar className="h-5 w-1/3" />
        <Bar className="w-5/6" />
        <Bar className="w-2/3" />
        <div className="mt-2 grid gap-3 border-t border-line pt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2 border-b border-line pb-4 last:border-0">
              <Bar className="h-4 w-24" />
              <Bar className="w-3/4" />
              <Bar className="w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
