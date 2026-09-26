"use client";

import { MotionConfig } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { api, type AnalysisResponse } from "@/lib/api";
import { ROLE_OPTIONS } from "@/lib/presets";
import type { Severity } from "@/lib/schemas";
import { AskPanel } from "./AskPanel";
import { DocumentView } from "./DocumentView";
import { ArrowCounterClockwise, PencilSimple, WarningOctagon } from "./icons";
import { InputForm, type DocumentInput } from "./InputForm";
import { LoadingState, type ProgressMap } from "./LoadingState";
import { Results } from "./Results";
import { Specimen } from "./Specimen";
import { Button } from "./ui/Button";

type State =
  | { status: "idle" }
  | { status: "loading"; input: DocumentInput }
  | { status: "error"; input: DocumentInput; message: string }
  | { status: "done"; input: DocumentInput; analysis: AnalysisResponse };

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function roleLabel(role: DocumentInput["role"]): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label.toLowerCase() ?? "reader";
}

function Intro() {
  return (
    <div className="mb-8 max-w-xl">
      <p className="font-mono text-xs uppercase text-accent">Before you sign</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-text text-balance md:text-4xl">
        Find the clauses that could cost you, in plain words.
      </h1>
      <p className="mt-3 max-w-[60ch] leading-relaxed text-muted text-pretty">
        Tell us who you are and what worries you. Every finding comes with the exact line from your document, and a list
        of questions to settle before signing.
      </p>
    </div>
  );
}

function ContextBar({ input, onEdit, onReset }: { input: DocumentInput; onEdit: () => void; onReset: () => void }) {
  const concerns = input.concerns.length ? input.concerns.join(", ") : "No specific concerns";
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <p className="min-w-0 text-sm text-muted">
        <span className="font-medium capitalize text-text">{roleLabel(input.role)}</span>
        <span className="mx-2 text-line-strong">/</span>
        {concerns}
        <span className="mx-2 text-line-strong">/</span>
        {input.language}
        <span className="mx-2 text-line-strong">/</span>
        {input.sourceLabel}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <PencilSimple size={16} aria-hidden="true" /> Edit answers
        </Button>
        <Button size="sm" onClick={onReset}>
          <ArrowCounterClockwise size={16} aria-hidden="true" /> New document
        </Button>
      </div>
    </div>
  );
}

export function Workspace() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [progress, setProgress] = useState<ProgressMap>({});
  const [draft, setDraft] = useState<DocumentInput | null>(null);
  const [locate, setLocate] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 });
  const topRef = useRef<HTMLDivElement>(null);

  const flagged = useMemo(() => {
    const map = new Map<string, Severity>();
    if (state.status !== "done") return map;
    for (const r of state.analysis.risks) {
      const id = r.verification.clauseId;
      if (!id) continue;
      const current = map.get(id);
      if (!current || SEVERITY_RANK[r.severity] > SEVERITY_RANK[current]) map.set(id, r.severity);
    }
    return map;
  }, [state]);

  function scrollTop() {
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      topRef.current?.focus({ preventScroll: true });
    });
  }

  async function analyse(input: DocumentInput) {
    setDraft(input);
    setProgress({});
    setState({ status: "loading", input });
    setLocate({ id: null, nonce: 0 });
    scrollTop();
    try {
      const analysis = await api.analyze(input, ({ stage, ...event }) =>
        setProgress((p) => ({ ...p, [stage]: event })),
      );
      setState({ status: "done", input, analysis });
      scrollTop();
    } catch (e) {
      setState({ status: "error", input, message: e instanceof Error ? e.message : "Analysis failed." });
    }
  }

  const locateClause = (id: string) => setLocate((l) => ({ id, nonce: l.nonce + 1 }));

  function showFinding(clauseId: string) {
    locateClause(clauseId);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(`finding-${clauseId}`)?.scrollIntoView({ behavior, block: "start" });
  }

  return (
    <MotionConfig reducedMotion="user">
      <div ref={topRef} tabIndex={-1} className="scroll-mt-24 focus:outline-none">
        <div aria-live="polite" className="sr-only">
          {state.status === "loading" && "Analysing your document. Progress updates follow."}
          {state.status === "done" && `Analysis ready. ${state.analysis.risks.length} clauses to watch.`}
        </div>

        {state.status === "idle" && (
          <div className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
            <div>
              <Intro />
              <InputForm busy={false} initial={draft} onSubmit={analyse} />
            </div>
            <aside aria-label="Example of a result" className="lg:sticky lg:top-24 lg:self-start lg:pt-24">
              <Specimen />
            </aside>
          </div>
        )}

        {state.status === "loading" && <LoadingState role={roleLabel(state.input.role)} progress={progress} />}

        {state.status === "error" && (
          <div role="alert" className="max-w-xl border-l-4 border-high pl-5">
            <p className="flex items-center gap-2 text-lg font-semibold text-high">
              <WarningOctagon size={22} weight="fill" aria-hidden="true" /> We could not finish the analysis
            </p>
            <p className="mt-2 text-text text-pretty">{state.message}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => analyse(state.input)}>
                <ArrowCounterClockwise size={16} aria-hidden="true" /> Try again
              </Button>
              <Button onClick={() => setState({ status: "idle" })}>
                <PencilSimple size={16} aria-hidden="true" /> Edit document
              </Button>
            </div>
          </div>
        )}

        {state.status === "done" && (
          <>
            <ContextBar
              input={state.input}
              onEdit={() => setState({ status: "idle" })}
              onReset={() => {
                setDraft(null);
                setState({ status: "idle" });
              }}
            />
            <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div className="grid min-w-0 content-start gap-10">
                <Results analysis={state.analysis} activeClauseId={locate.id} onLocate={locateClause} />
                <AskPanel
                  pages={state.input.pages}
                  role={state.input.role}
                  language={state.input.language}
                  onLocate={locateClause}
                />
              </div>
              <div className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:self-start">
                <DocumentView
                  clauses={state.analysis.clauses}
                  activeClauseId={locate.id}
                  locateNonce={locate.nonce}
                  flagged={flagged}
                  redactedCount={state.analysis.redactions.total}
                  onSelectFlagged={showFinding}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </MotionConfig>
  );
}
