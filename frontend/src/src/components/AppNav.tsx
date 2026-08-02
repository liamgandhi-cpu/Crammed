import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarRange, LogOut, ListChecks, CalendarDays, Award, Compass } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * The single app chrome for /today, /dashboard, /grades and /plan.
 *
 * Each of those pages previously carried its own copy of this nav, and the
 * three had drifted apart: different container widths (6xl / 7xl / full-bleed),
 * different active-tab treatments (a pill group on two pages, a tinted ghost
 * Button on the third), different avatar sizes, and three mobile bottom bars
 * at three z-indexes — one of which only listed two of the three sections.
 * Navigating between pages visibly shifted the header. One component ends that.
 */

const NAV_ITEMS = [
  { path: "/today", label: "Today", icon: ListChecks },
  { path: "/dashboard", label: "Schedule", icon: CalendarDays },
  { path: "/grades", label: "Grades", icon: Award },
  { path: "/plan", label: "Plan", icon: Compass },
] as const;

/** Shared measure for every app page, so main content lines up with the nav. */
export const APP_CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`group flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background ${className}`}
    >
      {/* Solid mark, not a tinted outline. A filled block reads as a brand;
          the old `bg-primary/10 border border-primary/20` chip read as a
          disabled button. */}
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary transition-transform duration-200 group-hover:-rotate-6">
        <CalendarRange className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
      </span>
      <span className="font-display text-[1.0625rem] font-extrabold tracking-[-0.03em] text-ink-1">
        AutoPlanner
      </span>
    </Link>
  );
}

export default function AppNav() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-xl">
        <div className={`${APP_CONTAINER} flex h-16 items-center justify-between gap-6`}>
          <Wordmark />

          {/* Desktop sections. An underline rule marks the active item rather
              than a raised pill — the rule is the same editorial device the
              rest of the page uses, and it costs no chrome. */}
          <nav aria-label="Sections" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map(({ path, label }) => {
                const active = pathname === path;
                return (
                  <li key={path}>
                    <Link
                      to={path}
                      aria-current={active ? "page" : undefined}
                      className={`relative block px-3.5 py-2 text-sm font-medium transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"
                      }`}
                    >
                      {label}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-3.5 -bottom-[1.3125rem] h-0.5 rounded-full bg-primary transition-opacity duration-200 ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-3 text-xs font-bold text-ink-2"
              title={user?.email ?? undefined}
            >
              {initials}
            </span>
            <button
              onClick={logout}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sections. Lists every section — the old Today-page bar listed
          only two, so Grades was unreachable on a phone from that screen. */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-md items-stretch">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = pathname === path;
            return (
              <li key={path} className="flex-1">
                <button
                  onClick={() => navigate(path)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 w-full flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    active ? "text-primary" : "text-ink-3"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[0.6875rem] font-semibold tracking-tight">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** Spacer that keeps page content clear of the fixed mobile bar. */
export function MobileNavSpacer() {
  return <div aria-hidden="true" className="h-16 md:hidden" />;
}
