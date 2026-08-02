import { Wordmark } from "@/components/AppNav";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  /** Shown on the editorial panel — tells the user what they're signing up to. */
  aside?: React.ReactNode;
}

/**
 * Split masthead.
 *
 * The old layout was a `max-w-md` card floated in the middle of an empty
 * near-black page — the single most generic auth screen there is, and on a
 * wide display it left the entire viewport dead around a 448px box. The left
 * panel now carries the same display type as the landing hero, so arriving
 * from the marketing page feels continuous rather than like a different site.
 *
 * The panel is decorative and hidden below `lg`; nothing needed to complete
 * the form lives there.
 */
export function AuthLayout({ children, title, subtitle, aside }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Editorial panel ───────────────────────────────── */}
      <aside className="relative hidden flex-col justify-between border-r border-border bg-surface-1 p-12 lg:flex xl:p-16">
        <Wordmark />

        <div>
          <h2 className="max-w-measure-tight text-balance font-display text-display-3 text-ink-1">
            Stop juggling.
            <br />
            <span className="text-primary">Start planning.</span>
          </h2>
          {aside && (
            <div className="mt-10 max-w-measure-tight">{aside}</div>
          )}
        </div>

        <p className="text-micro text-ink-4">
          © {new Date().getFullYear()} AutoPlanner
        </p>
      </aside>

      {/* ── Form column ───────────────────────────────────── */}
      <main className="flex min-h-screen flex-col justify-center px-5 py-12 sm:px-8 lg:min-h-0 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-[26rem]">
          {/* Wordmark only where the panel isn't showing it. */}
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>

          <div className="mb-8">
            <h1 className="text-balance font-display text-display-3 text-ink-1">
              {title}
            </h1>
            <p className="mt-2 text-pretty text-ink-3">{subtitle}</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * "or" rule between the Google button and the credential form.
 *
 * Lives here rather than being copy-pasted into both auth pages, where each
 * copy hardcoded `bg-card` for the label's knockout — a colour that is now
 * wrong, because the form no longer sits on a card.
 */
export function AuthDivider() {
  return (
    <div className="relative my-6" role="separator">
      <span aria-hidden="true" className="absolute inset-0 flex items-center">
        <span className="h-px w-full bg-[hsl(var(--rule))]" />
      </span>
      <span className="relative flex justify-center">
        <span className="bg-background px-3 text-kicker uppercase text-ink-4">
          or
        </span>
      </span>
    </div>
  );
}

/** Ruled list for the panel aside. */
export function AuthAsideList({ items }: { items: string[] }) {
  return (
    <ul className="ruled border-t border-[hsl(var(--rule))]">
      {items.map((t) => (
        <li key={t} className="py-3.5 text-sm leading-relaxed text-ink-3">
          {t}
        </li>
      ))}
    </ul>
  );
}
