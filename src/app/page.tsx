import { Workspace } from "@/components/Workspace";

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-ink" />
        {/* A page with text lines, examined by a lens. */}
        <path d="M9 7h9l5 5v13H9Z" fill="none" strokeWidth="1.6" strokeLinejoin="round" className="stroke-ink-contrast opacity-60" />
        <path d="M12 13h6M12 16.5h4" strokeWidth="1.6" strokeLinecap="round" className="stroke-ink-contrast opacity-60" />
        <circle cx="19" cy="19.5" r="4" strokeWidth="2" className="fill-ink stroke-ink-contrast" />
        <path d="m22 22.5 3 3" strokeWidth="2.2" strokeLinecap="round" className="stroke-ink-contrast" />
      </svg>
      <span className="text-[15px] font-semibold text-text">Doclens</span>
    </span>
  );
}

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <p className="hidden text-sm text-muted sm:block">Information, not legal advice.</p>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6 md:pt-12">
        <Workspace />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
          <p className="text-pretty">
            Doclens explains documents; it does not replace a qualified lawyer.
          </p>
          <p>Documents are processed in memory and never stored.</p>
        </div>
      </footer>
    </>
  );
}
