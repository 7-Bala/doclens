"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CONCERN_PRESETS, ROLE_OPTIONS, SAMPLES } from "@/lib/presets";
import { LANGUAGES, LIMITS, type Language, type Role } from "@/lib/schemas";
import { ArrowRight, Briefcase, Check, FilePdf, House, Laptop, Plus, ShoppingBag, Translate, User, X } from "./icons";
import { Button } from "./ui/Button";

export interface DocumentInput {
  pages: string[];
  role: Role;
  concerns: string[];
  language: Language;
  /** Where the text came from, shown back to the user in the results header. */
  sourceLabel: string;
}

const ROLE_ICONS = { tenant: House, employee: Briefcase, freelancer: Laptop, consumer: ShoppingBag, other: User };

interface Props {
  busy: boolean;
  initial?: DocumentInput | null;
  onSubmit: (input: DocumentInput) => void;
}

function Step({ index, title, hint, children }: { index: string; title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-faint tabular-nums">{index}</span>
        <div>
          <p className="font-semibold text-text">{title}</p>
          {hint && <p className="text-sm text-muted text-pretty">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function InputForm({ busy, initial, onSubmit }: Props) {
  const [role, setRole] = useState<Role>(initial?.role ?? "tenant");
  const [concerns, setConcerns] = useState<string[]>(initial?.concerns ?? []);
  const [customConcern, setCustomConcern] = useState("");
  const [language, setLanguage] = useState<Language>(initial?.language ?? "English");
  const [text, setText] = useState(initial?.pages.join("\n\n") ?? "");
  const [pdfPages, setPdfPages] = useState<string[] | null>(initial && initial.pages.length > 1 ? initial.pages : null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(initial?.sourceLabel ?? null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { role: useId(), text: useId(), lang: useId(), custom: useId(), err: useId(), help: useId() };

  const chips = Array.from(new Set([...CONCERN_PRESETS[role], ...concerns]));
  const atConcernLimit = concerns.length >= LIMITS.maxConcerns;

  function toggleConcern(c: string) {
    setConcerns((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < LIMITS.maxConcerns ? [...prev, c] : prev));
  }

  function addCustomConcern() {
    const c = customConcern.trim();
    if (c && !concerns.includes(c) && !atConcernLimit) setConcerns([...concerns, c]);
    setCustomConcern("");
  }

  async function loadSample(sample: (typeof SAMPLES)[number]) {
    setError(null);
    try {
      const res = await fetch(sample.file);
      setText(await res.text());
      setPdfPages(null);
      setSourceLabel(`Sample: ${sample.label}`);
      setRole(sample.role);
      setConcerns(sample.concerns);
    } catch {
      setError("Could not load the sample. Please try again.");
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      setError("Only PDF files are supported. For other formats, paste the text instead.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { pages } = await api.extractPdf(file);
      setPdfPages(pages);
      setText(pages.join("\n\n"));
      setSourceLabel(`${file.name} · ${pages.length} page${pages.length === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 50) {
      setError("Paste the document text (at least a few sentences) or upload a PDF.");
      return;
    }
    if (text.length > LIMITS.maxDocumentChars) {
      setError(`This document is too long. The limit is ${LIMITS.maxDocumentChars.toLocaleString()} characters.`);
      return;
    }
    setError(null);
    onSubmit({ pages: pdfPages ?? [text], role, concerns, language, sourceLabel: sourceLabel ?? "Pasted text" });
  }

  const overLimit = text.length > LIMITS.maxDocumentChars;

  return (
    <form onSubmit={submit} noValidate className="grid gap-6" aria-describedby={error ? ids.err : undefined}>
      <Step index="01" title={<span id={ids.role}>Who are you in this agreement?</span>}>
        <div role="radiogroup" aria-labelledby={ids.role} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ROLE_OPTIONS.map((r) => {
            const Icon = ROLE_ICONS[r.value];
            const selected = role === r.value;
            return (
              <label
                key={r.value}
                className={cn(
                  "group relative flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-150",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                  selected ? "border-ink bg-surface shadow-sm" : "border-line bg-surface/60 hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={selected}
                  onChange={() => {
                    setRole(r.value);
                    setConcerns([]);
                  }}
                  className="sr-only"
                />
                <Icon size={18} weight={selected ? "fill" : "regular"} className={cn("mt-0.5 shrink-0", selected ? "text-ink" : "text-faint")} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{r.label}</span>
                  <span className="block text-xs leading-snug text-muted">{r.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Step>

      <Step index="02" title="What worries you most?" hint={`Pick up to ${LIMITS.maxConcerns}. These findings are ranked first.`}>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = concerns.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={!on && atConcernLimit}
                onClick={() => toggleConcern(c)}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm transition-[transform,background-color,border-color] duration-150 ease-out active:scale-[0.98]",
                  "disabled:cursor-not-allowed disabled:opacity-45",
                  on ? "border-ink bg-ink text-ink-contrast" : "border-line bg-surface text-text hover:border-line-strong",
                )}
              >
                {on && <Check size={14} weight="bold" aria-hidden="true" />}
                {c}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <label htmlFor={ids.custom} className="sr-only">
            Add your own concern
          </label>
          <input
            id={ids.custom}
            value={customConcern}
            maxLength={60}
            disabled={atConcernLimit}
            onChange={(e) => setCustomConcern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomConcern();
              }
            }}
            placeholder="Add your own, e.g. can I keep a pet?"
            className="min-h-11 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-faint disabled:opacity-50"
          />
          <Button onClick={addCustomConcern} disabled={!customConcern.trim() || atConcernLimit} aria-label="Add concern">
            <Plus size={16} weight="bold" aria-hidden="true" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </Step>

      <Step index="03" title={<label htmlFor={ids.text}>Your document</label>}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-muted">No contract handy? Try one:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              type="button"
              onClick={() => loadSample(s)}
              className="min-h-11 cursor-pointer font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "overflow-hidden rounded-xl border bg-paper transition-colors duration-150",
            dragging ? "border-ink ring-2 ring-ink/20" : "border-line focus-within:border-line-strong",
          )}
        >
          <textarea
            id={ids.text}
            value={text}
            aria-describedby={ids.help}
            aria-invalid={overLimit || undefined}
            onChange={(e) => {
              setText(e.target.value);
              setPdfPages(null);
              setSourceLabel(null);
            }}
            rows={9}
            placeholder="Paste the full text of your agreement, or drop a PDF here."
            className="block w-full resize-y bg-transparent p-4 font-serif text-[15px] leading-relaxed text-text placeholder:font-sans placeholder:text-faint focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-3 py-1.5">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium text-text hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <FilePdf size={18} aria-hidden="true" />
              {uploading ? "Reading PDF…" : "Upload PDF"}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            <p id={ids.help} className="flex items-center gap-3 text-xs text-muted">
              {sourceLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-text">
                  {sourceLabel}
                </span>
              )}
              <span className={cn("font-mono tabular-nums", overLimit && "text-high")}>
                {text.length.toLocaleString()} / {LIMITS.maxDocumentChars.toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </Step>

      <div className="grid gap-4 border-t border-line pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <label htmlFor={ids.lang} className="inline-flex items-center gap-2 text-sm font-medium text-text">
            <Translate size={16} aria-hidden="true" /> Explain it to me in
          </label>
          <select
            id={ids.lang}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="min-h-11 w-full max-w-xs cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" size="lg" disabled={busy || uploading} className="w-full sm:w-auto">
          {busy ? "Reading your document…" : "Check before I sign"}
          {!busy && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
        </Button>
      </div>

      {error && (
        <p id={ids.err} role="alert" className="flex items-start gap-2 rounded-lg bg-high-soft px-3 py-2.5 text-sm text-high">
          <X size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </form>
  );
}
