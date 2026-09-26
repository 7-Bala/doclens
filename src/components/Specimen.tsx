"use client";

import { motion } from "motion/react";
import { SeverityBadge, VerificationBadge } from "./Badges";
import { LockKey, SealCheck, Translate } from "./icons";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Empty state: a working preview of what an analysis looks like, built from the real
 * result components so it doubles as a truthful product demo. Decorative, so it is
 * hidden from assistive technology; the promises beside it carry the meaning.
 */
export function Specimen() {
  return (
    <div className="grid gap-6">
      <div aria-hidden="true" className="relative select-none">
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-[0_24px_48px_-24px_rgb(15_23_41/0.18)] sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase text-faint">Leave and licence agreement · page 1</p>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase text-faint">Example</span>
          </div>
          <div className="mt-5 grid gap-4 font-serif text-[15px] leading-relaxed text-muted">
            <p>
              <span className="font-mono text-xs text-faint">4.</span> The Licensee shall pay an interest-free refundable
              security deposit of Rs.&nbsp;1,50,000.
            </p>
            <p className="relative">
              <span className="font-mono text-xs text-faint">5.</span>{" "}
              {/* A real highlighter: each wrapped line gets its own sweep via box-decoration-clone. */}
              <motion.span
                className="rounded-sm bg-no-repeat px-0.5 text-text [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
                style={{ backgroundImage: "linear-gradient(var(--highlight), var(--highlight))" }}
                initial={{ backgroundSize: "0% 100%" }}
                animate={{ backgroundSize: "100% 100%" }}
                transition={{ duration: 0.7, delay: 0.35, ease: EASE_OUT }}
              >
                If the Licensee vacates during the lock-in period for any reason, the security deposit shall be forfeited.
              </motion.span>
            </p>
            <p>
              <span className="font-mono text-xs text-faint">6.</span> The Licensor may terminate this agreement at any time
              by giving 15 days notice.
            </p>
            <div className="grid gap-2 pt-1">
              <span className="h-2 w-11/12 rounded-full bg-surface-2" />
              <span className="h-2 w-8/12 rounded-full bg-surface-2" />
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.9, ease: EASE_OUT }}
          className="relative -mt-10 ml-6 mr-2 rounded-xl border border-line bg-surface p-4 shadow-[0_20px_40px_-20px_rgb(15_23_41/0.25)] sm:ml-16 sm:mr-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            <SeverityBadge severity="high" />
            <VerificationBadge status="verified" />
            <span className="font-mono text-xs text-faint">Clause 5</span>
          </div>
          <p className="mt-2 font-semibold text-text">Leaving early costs your whole deposit</p>
          <p className="mt-1 text-sm text-muted">
            For you: moving out in month 4 forfeits Rs.&nbsp;1,50,000 and still leaves 2 months of rent to pay.
          </p>
        </motion.div>
      </div>

      <ul className="grid gap-3 text-sm">
        <li className="flex items-center gap-2 text-muted">
          <SealCheck size={18} weight="fill" className="text-ok" aria-hidden="true" />
          Every finding checked against your text
        </li>
        <li className="flex items-center gap-2 text-muted">
          <LockKey size={18} weight="fill" className="text-ink" aria-hidden="true" />
          ID numbers hidden from the AI
        </li>
        <li className="flex items-center gap-2 text-muted">
          <Translate size={18} className="text-ink" aria-hidden="true" />
          7 Indian languages
        </li>
      </ul>
    </div>
  );
}
