# Doclens

**Know what you're signing, before you sign.**

Doclens reads a contract from *your* point of view (tenant, employee, freelancer, consumer) and shows the clauses that could cost you, each one backed by the exact line from your document. It ends with a clear recommendation and the questions to settle before signing.

Built for **PromptWars: Virtual, challenge "AI for Legal Assistance & Access"**.

---

## Chosen vertical

**AI for Legal Assistance & Access**, focused on the moment that matters most: *just before signing*. Once someone signs, their options narrow sharply. Common Indian cases this targets:

| Person | Document | What they fear |
|---|---|---|
| Tenant | 11-month leave-and-licence agreement | Losing the deposit, lock-in penalties, repair costs |
| Employee / fresher | Offer letter, training bond | Service-bond penalties, notice period, non-compete |
| Freelancer | Client contract, NDA | Unpaid work, IP grab, unlimited liability |
| Consumer | Terms of service, policies | Auto-renewal, refunds, data sharing |

## Why not just paste it into a chatbot?

A general chatbot gives a generic summary and can quote text that isn't there. Doclens is built around four things a chatbot doesn't do:

1. **Personalised.** You choose your role and what worries you. Findings are ranked for *you*: a tenant sees the deposit clause first, not the landlord's indemnity.
2. **Every claim is verified in code.** Every quote the AI returns is matched against your document with deterministic string logic, and every figure (₹ amounts, durations, dates) is checked against the cited clause. Each finding shows **Verified**, **Close match**, or **Not found in document**.
3. **It says "not in this document" honestly.** Questions are answered only from the document. If the answer isn't there, it says so and suggests what to ask instead.
4. **The output is a decision.** You get a verdict (Sign / Negotiate / Talk to a lawyer), what to ask for on each clause, missing protections, and a downloadable brief for a lawyer.

## How it works

```
 PDF or pasted text
        │
        ▼
 1. Redact personal data         redact.ts    phone, email, PAN, Aadhaar, IFSC, account numbers
        │                                     (also rejoins IDs split across PDF line breaks)
        ▼
 2. Split into clauses           clauses.ts   keeps the document's own numbering ("Clause 5"),
        │                                     assigns letter ids (A, B, …) the AI cites
        ▼
 3. Gemini reads it as YOU       gemini.ts    role + concerns + language in the prompt;
        │                                     output forced into a JSON schema (Zod)
        ▼
 4. Verify every claim           verify.ts    quotes: exact → whitespace-tolerant → fuzzy match
        │                                     figures: every number must exist in the cited clause
        ▼
 5. Compute the verdict          verdict.ts   deterministic rules over *verified* findings
        │
        ▼
 Results, streamed live           ?stream=1    real progress events as each step finishes
```

### Approach and logic

The design splits the work between the AI and ordinary code. **The language model does what it is good at** (reading legal language, judging what matters to this person, explaining it simply). **Deterministic code does what must be exact**: removing personal data, finding clauses, checking quotes and numbers, and deciding the verdict. So the AI's contribution can always be checked, and the parts that must never be wrong never depend on the model.

Key decisions:

- **Evidence verification** (`src/lib/verify.ts`). A quote is *verified* if it appears in the document (ignoring case, quote style and PDF line breaks), *close match* if at least 80% of its words appear in order, otherwise *unverified*. Unverified findings are shown with a warning and never escalate the verdict.
- **Letter clause ids** (`A`, `B`, … `AA`). Numeric ids like `C9` were once echoed back as "Clause 9", a real clause with a different meaning. Letter ids can't be mistaken for clause numbers.
- **Verdict policy** (`src/lib/verdict.ts`). It is conservative, because wrongly saying "sign" does more harm than wrongly saying "negotiate":
  - **Talk to a lawyer:** 2 or more confirmed high-risk clauses, or 1 high plus 3 medium.
  - **Negotiate:** any confirmed high- or medium-risk clause; any finding whose quote couldn't be verified; or 3 or more missing standard protections.
  - **Sign:** only minor points remain.
- **Resilient AI calls** (`src/lib/retry.ts`). Each failure type gets its own handling:
  - Overload: retry once.
  - Quota exhausted or model retired: skip immediately and remember it (cooldown).
  - Hung call: 30-second timeout per attempt.
  - Whole request: kept under a 55-second budget, inside the serverless limit.
  - Every model switch is shown to the user in the progress stream.

## Features

- Role, concern and language personalisation (English, Hindi, Tamil, Telugu, Kannada, Bengali, Marathi). Explanations are in your language, while quotes stay verbatim so they can still be verified.
- PDF upload (text extraction with line-layout reconstruction) or paste, with drag and drop.
- Key-terms summary, severity-ranked findings with a filter, missing protections, questions to ask.
- **Show in document**: jump from any finding to the highlighted clause, or from a flagged clause back to its finding.
- Grounded Q&A with verified citations, or an honest "Not covered in this document".
- Downloadable plain-text brief for a lawyer.
- Live progress streamed from the server (NDJSON), with real counts and real elapsed time.

## Google services used

- **Gemini API** (`@google/genai`) with **structured JSON output** (`responseJsonSchema`) for document analysis and grounded Q&A. Primary model `gemini-2.5-flash` (thinking disabled for speed), with a Gemini fallback chain: `gemini-3-flash-preview`, `gemini-3.6-flash`, `gemini-flash-latest`, `gemini-3.1-flash-lite`, `gemini-flash-lite-latest`.

## Security and privacy

- Personal identifiers are **redacted before any text reaches the AI**. The UI marks them as "phone hidden", "PAN hidden", and so on.
- Documents are processed in memory and **never stored**. Only derived results are cached in memory, keyed by a SHA-256 hash.
- Prompt-injection defence: the document is passed as delimited, untrusted data, and the model is told never to follow instructions inside it.
- All input is validated with Zod at the API boundary (size, type and length limits). PDFs are checked by magic bytes, not by file extension.
- Rate limiting: 10 AI requests per minute per client.
- Security headers on every response: Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer-Policy, Permissions-Policy.
- Error messages never leak configuration or internals. The API key lives only in server-side environment variables.

## Accessibility

- Semantic landmarks, a skip link, labelled form controls, and radio/toggle semantics (`aria-pressed`, `aria-current`).
- Progress and answers are announced through `aria-live` regions. Focus moves to results when they are ready.
- Visible focus rings. Every interactive element is at least 44 px. Colour contrast is WCAG AA in both light and dark themes.
- Verification and severity use an icon plus text, never colour alone.
- Respects `prefers-reduced-motion`. Tested at 375 px with no horizontal scrolling.

## Testing

90 automated tests (Vitest) cover the deterministic core and the API:

```bash
npm test          # unit and API tests (no network or API key needed)
npm run typecheck # TypeScript
npm run lint      # ESLint
```

| Area | Examples of what is tested |
|---|---|
| Verification | hallucinated quotes flagged; altered figures rejected; PDF line-wrap artefacts still verify |
| Redaction | all identifier types; split emails don't leak; clause numbers and amounts untouched |
| Verdict | every policy branch; unverified evidence never escalates; reasons name the clauses |
| Pipeline | personal data never reaches the prompt; progress events are real and ordered |
| Resilience | quota skip, retired-model skip, timeouts, deadline, cooldowns |
| API | malformed JSON, invalid input, missing key (no details leaked), rate limit, fake PDFs, streaming |

Several tests are regressions for bugs found during live end-to-end testing against Gemini. They are labelled as such in the test files.

## Running locally

Requirements: Node.js 20 or later, and a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
npm install
cp .env.example .env.local   # then set GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Optional environment variables: `GEMINI_MODEL` (primary model) and `GEMINI_FALLBACK_MODELS` (comma-separated).

Use **Try one: Rental agreement / Job offer letter** in the app to test without your own contract. The samples contain deliberately unfair clauses and fake personal details.

## Project structure

```
src/
  app/
    api/analyze/route.ts   analysis (JSON or streamed NDJSON)
    api/ask/route.ts       grounded Q&A
    api/extract/route.ts   PDF → text per page
    page.tsx, layout.tsx
  components/              UI (form, results, document view, Q&A, loading)
  lib/
    analyze.ts             pipeline orchestration
    redact.ts clauses.ts verify.ts verdict.ts   deterministic core
    gemini.ts retry.ts prompts.ts schemas.ts   AI layer
tests/                     Vitest suites
```

## Assumptions and limitations

- **Information, not legal advice.** Doclens helps people understand a document and prepare. It does not replace a lawyer, and the UI says so.
- The analysis uses **only the uploaded document**. It does not check contracts against statutes, which would invite hallucinated law.
- Scanned (image-only) PDFs aren't supported; the app asks you to paste the text instead. Documents are limited to 60,000 characters.
- The redaction patterns target Indian identifiers. Names of the parties are intentionally kept, because they are needed to understand who owes what.
- The in-memory cache and rate limiter are per server instance, which is enough for this scale.
- On Gemini's free tier each model allows a limited number of requests per day. The fallback chain spreads load across models; enable billing for production use.
