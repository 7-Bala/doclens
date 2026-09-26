"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import type { Answer } from "@/lib/analyze";
import { api } from "@/lib/api";
import { LIMITS, type Language, type Role } from "@/lib/schemas";
import { VerificationBadge } from "./Badges";
import { ArrowUp, ChatCircleText, Crosshair, Question, Warning, X } from "./icons";
import { Section } from "./Results";

interface Props {
  pages: string[];
  role: Role;
  language: Language;
  onLocate: (clauseId: string) => void;
}

interface Turn {
  id: number;
  question: string;
  answer: Answer;
}

const SUGGESTIONS: Record<Role, string[]> = {
  tenant: ["What happens if I leave after 4 months?", "Can I keep a pet?", "When do I get my deposit back?"],
  employee: ["What if I resign after 1 year?", "Can I join a competitor later?", "Can they hold my certificates?"],
  freelancer: ["When will I be paid?", "Who owns the work I create?", "Can I end this contract early?"],
  consumer: ["How do I cancel?", "Will I get a refund?", "Who is my data shared with?"],
  other: ["What do I owe if I exit early?", "What are my main obligations?", "Is there any penalty?"],
};

export function AskPanel({ pages, role, language, onLocate }: Props) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await api.ask({ pages, role, language, question: trimmed });
      setTurns((t) => [{ id: Date.now(), question: trimmed, answer }, ...t]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get an answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="ask-heading" eyebrow="Answered only from your document" title="Ask anything about it">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface p-1.5 pl-3 focus-within:border-ink"
      >
        <ChatCircleText size={20} className="shrink-0 text-faint" aria-hidden="true" />
        <label htmlFor={inputId} className="sr-only">
          Your question about the document
        </label>
        <input
          id={inputId}
          value={question}
          maxLength={LIMITS.maxQuestionChars}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What happens if I leave early?"
          className="min-h-11 w-full min-w-0 bg-transparent text-text placeholder:text-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < 3}
          aria-label={busy ? "Checking your document" : "Ask"}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg bg-ink text-ink-contrast transition-transform duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <span className="size-4 animate-spin rounded-full border-2 border-ink-contrast/40 border-t-ink-contrast" /> : <ArrowUp size={18} weight="bold" aria-hidden="true" />}
        </button>
      </form>

      {turns.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS[role].map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => ask(s)}
              className="min-h-11 cursor-pointer rounded-full border border-line bg-surface px-3.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-text disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-high-soft px-3 py-2.5 text-sm text-high">
          <X size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div aria-live="polite" className="mt-5 grid gap-4">
        <AnimatePresence initial={false}>
          {turns.map((turn) => (
            <motion.article
              key={turn.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="rounded-xl border border-line bg-surface p-5"
            >
              <h3 className="font-medium text-text">{turn.question}</h3>
              {!turn.answer.found && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-muted">
                  <Question size={14} weight="bold" aria-hidden="true" /> Not covered in this document
                </p>
              )}
              {turn.answer.ungrounded && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-high-soft px-2 py-1 text-xs font-medium text-high">
                  <Warning size={14} weight="bold" aria-hidden="true" /> No supporting text found. Treat with caution.
                </p>
              )}
              <p className="mt-2 leading-relaxed text-text text-pretty">{turn.answer.answer}</p>
              {turn.answer.citations.length > 0 && (
                <ul className="mt-4 grid gap-3">
                  {turn.answer.citations.map((c, j) => (
                    <li key={j}>
                      <blockquote className="border-l-2 border-highlight-line pl-4 font-serif text-[15px] leading-relaxed text-text">{c.quote}</blockquote>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-4">
                        <VerificationBadge status={c.verification.status} />
                        {c.verification.clauseId && (
                          <button
                            type="button"
                            onClick={() => onLocate(c.verification.clauseId!)}
                            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-ink hover:bg-surface-2"
                          >
                            <Crosshair size={15} aria-hidden="true" /> Show in document
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </Section>
  );
}
