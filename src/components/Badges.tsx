import { SealCheck, Warning, WarningOctagon, Info, Approximate, Question } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/schemas";
import type { VerificationStatus } from "@/lib/verify";

const SEVERITY = {
  high: { label: "High risk", Icon: WarningOctagon, className: "bg-high-soft text-high" },
  medium: { label: "Medium risk", Icon: Warning, className: "bg-medium-soft text-medium" },
  low: { label: "Worth knowing", Icon: Info, className: "bg-low-soft text-low" },
} satisfies Record<Severity, unknown>;

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, Icon, className } = SEVERITY[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold", className)}>
      <Icon size={14} weight="bold" aria-hidden="true" />
      {label}
    </span>
  );
}

const VERIFICATION = {
  verified: {
    label: "Verified",
    detail: "This exact text was found in your document.",
    Icon: SealCheck,
    className: "text-ok",
  },
  approximate: {
    label: "Close match",
    detail: "Very similar text was found in your document. Check the highlighted clause.",
    Icon: Approximate,
    className: "text-medium",
  },
  unverified: {
    label: "Not found in document",
    detail: "This quote could not be found in your document. Treat this point with caution.",
    Icon: Question,
    className: "text-high",
  },
} satisfies Record<VerificationStatus, unknown>;

export function VerificationBadge({ status, compact = false }: { status: VerificationStatus; compact?: boolean }) {
  const { label, detail, Icon, className } = VERIFICATION[status];
  return (
    <span title={detail} className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}>
      <Icon size={15} weight="fill" aria-hidden="true" />
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <span className="sr-only">. {detail}</span>
    </span>
  );
}
