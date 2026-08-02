import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Wordmark } from "@/components/AppNav";

/**
 * Editorial rebuild.
 *
 * The previous version drew every section as the same
 * `bg-card border border-border rounded-xl` box — preview, steps, features and
 * closing CTA were visually indistinguishable, under three identically sized
 * centred headings and a uniform `pb-24`. Nothing ranked, so the eye had no
 * route through the page.
 *
 * Here each section declares itself a different way: the hero is a masthead
 * over a rule, the steps are an oversized numbered sequence, the features sit
 * on their own darker ground, and the close is type on the page with no box at
 * all. Only the product artifact keeps a card, because it is the one thing
 * that should look like a piece of UI.
 */

/* Real capabilities, not benefit-shaped filler. Everything named here is
   something the app actually ships — the integrations in ConnectAccountModal,
   the planner in TodayPage, the timer in PomodoroTimer, the four-year plan in
   ECPlanPage. The old copy sold three generic virtues and mentioned none of it.

   Card 04 used to advertise the weighted GPA in GradesPage. That page is no
   longer in the nav, so the claim would have pointed at nothing. */
const CAPABILITIES = [
  {
    n: "01",
    title: "Import it, don't retype it",
    body: "Connect Schoology or Ion and your classes and assignments come across on their own. Or drop in a syllabus and let it read the dates out.",
  },
  {
    n: "02",
    title: "A plan, not another calendar",
    body: "Study blocks get sized to the work that's actually due, breaks get built in, and anything that collides gets flagged before you live it.",
  },
  {
    n: "03",
    title: "Focus, then see the proof",
    body: "Start a timer on any block. Your focus hours and streak roll up into a weekly summary you can have mailed to yourself.",
  },
  {
    n: "04",
    title: "Four years, not four weeks",
    body: "Build an extracurricular plan grade by grade — what to start, what to stick with, and the first concrete step for each one.",
  },
];

const STEPS = [
  { n: "1", label: "Bring in your classes", detail: "Connect an account, drop a file, or type them once." },
  { n: "2", label: "Add what's due", detail: "Assignments, exams, practices, shifts — anything with a date." },
  { n: "3", label: "Open it tomorrow morning", detail: "The day is already laid out, hour by hour." },
];

/* Preview data. Uses the categorical tokens rather than the raw
   blue-500 / violet-500 / green-500 / yellow-500 / rose-500 the old preview
   reached for — five hues that existed nowhere else in the product. */
const WEEK: { day: string; blocks: { label: string; time: string; span: number; cat: string }[] }[] = [
  { day: "Mon", blocks: [
    { label: "CS 301", time: "9:00", span: 3, cat: "class" },
    { label: "Study · PS4", time: "12:30", span: 2, cat: "study" },
    { label: "Robotics", time: "15:00", span: 2, cat: "week" },
  ]},
  { day: "Tue", blocks: [
    { label: "MATH 210", time: "8:00", span: 2, cat: "class" },
    { label: "CS 301", time: "11:00", span: 3, cat: "class" },
    { label: "Gym", time: "17:00", span: 1, cat: "free" },
  ]},
  { day: "Wed", blocks: [
    { label: "Study · Lab", time: "9:30", span: 2, cat: "study" },
    { label: "ENG 101", time: "13:00", span: 3, cat: "warn" },
    { label: "Break", time: "16:00", span: 1, cat: "free" },
  ]},
  { day: "Thu", blocks: [
    { label: "MATH 210", time: "8:00", span: 2, cat: "class" },
    { label: "Lab", time: "10:30", span: 2, cat: "week" },
    { label: "Study · Essay", time: "14:00", span: 2, cat: "study" },
  ]},
  { day: "Fri", blocks: [
    { label: "ENG 101", time: "9:00", span: 2, cat: "warn" },
    { label: "Study · Essay", time: "13:30", span: 2, cat: "study" },
    { label: "Essay due", time: "17:00", span: 2, cat: "due" },
  ]},
];

const CAT_STYLE: Record<string, { bar: string; text: string; bg: string }> = {
  class: { bar: "bg-cat-class", text: "text-cat-class", bg: "bg-cat-class/[0.08]" },
  study: { bar: "bg-cat-study", text: "text-cat-study", bg: "bg-cat-study/[0.08]" },
  free:  { bar: "bg-cat-free",  text: "text-cat-free",  bg: "bg-cat-free/[0.08]" },
  due:   { bar: "bg-cat-due",   text: "text-cat-due",   bg: "bg-cat-due/[0.10]" },
  week:  { bar: "bg-cat-week",  text: "text-cat-week",  bg: "bg-cat-week/[0.08]" },
  warn:  { bar: "bg-cat-warn",  text: "text-cat-warn",  bg: "bg-cat-warn/[0.08]" },
};

const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8";

function WeekPreview() {
  return (
    <figure className="surface-raised overflow-hidden p-0">
      <figcaption className="flex items-baseline justify-between border-b border-border px-4 py-3 sm:px-5">
        <span className="kicker">This week</span>
        <span className="text-micro text-ink-4">Generated in 4s</span>
      </figcaption>

      <div className="grid grid-cols-5 gap-px bg-border/60">
        {WEEK.map((col) => (
          <div key={col.day} className="bg-surface-2 px-2 pb-3 pt-2.5 sm:px-2.5">
            <div className="mb-2 text-center text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink-4">
              {col.day}
            </div>
            <div className="flex flex-col gap-1.5">
              {col.blocks.map((b) => {
                const s = CAT_STYLE[b.cat];
                return (
                  <div
                    key={b.label + b.time}
                    className={`relative overflow-hidden rounded-md pl-2 pr-1.5 py-1.5 ${s.bg}`}
                    style={{ minHeight: `${b.span * 14 + 12}px` }}
                  >
                    <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} aria-hidden="true" />
                    <span className={`block truncate text-[0.625rem] font-semibold leading-tight sm:text-[0.6875rem] ${s.text}`}>
                      {b.label}
                    </span>
                    <span className="mt-0.5 block font-mono text-[0.5625rem] leading-none text-ink-4">
                      {b.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-xl">
        <div className={`${CONTAINER} flex h-16 items-center justify-between`}>
          <Wordmark />
          <div className="flex items-center gap-1.5">
            {user ? (
              <Button size="sm" asChild>
                <Link to="/today">
                  Open planner
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero masthead ─────────────────────────────────────
            Headline spans the full measure instead of sitting in a
            max-w-2xl column, which is what left ~45% of the old fold
            empty with nothing to balance it. */}
        <section className={`${CONTAINER} pt-16 sm:pt-24 lg:pt-28`}>
          <p className="kicker-rule mb-7 animate-fade-slide-up">
            <span className="shrink-0">Weekly planner for students</span>
          </p>

          <h1 className="animate-fade-slide-up text-balance font-display text-display-1 text-ink-1">
            Stop juggling.
            <br />
            <span className="text-primary">Start planning.</span>
          </h1>

          <hr className="rule mt-10 sm:mt-14" />

          <div className="grid gap-10 pt-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <p className="max-w-measure text-pretty text-lg leading-relaxed text-ink-2">
                Paste in your classes, activities and assignments. Get back a
                real schedule — hour by hour, conflicts caught, study time
                already accounted for.
              </p>

              {/* One action. The secondary "I already have an account" button
                  that used to sit here wrapped onto its own line inside this
                  5-column well and, carrying lg padding, read as an indented
                  orphan rather than a choice. Log in already lives in the nav. */}
              <div className="mt-8">
                <Button size="lg" asChild>
                  <Link to="/signup">
                    Get started — it's free
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              {/* Concrete and verifiable, in place of the old
                  "Join thousands of students" — a number nobody could stand
                  behind and the single most template-like line on the page. */}
              <p className="mt-6 text-sm text-ink-3">
                No card required. Imports from{" "}
                <span className="font-medium text-ink-2">Schoology</span> and{" "}
                <span className="font-medium text-ink-2">Ion</span>, or any
                syllabus you drop in.
              </p>
            </div>

            <div className="lg:col-span-7">
              <WeekPreview />
            </div>
          </div>
        </section>

        {/* ── Steps ─────────────────────────────────────────────
            Oversized numerals on rules. No cards — three more boxes here is
            exactly what made the old page read as generated. */}
        <section className={`${CONTAINER} pt-24 sm:pt-32`}>
          <h2 className="kicker-rule mb-10">
            <span className="shrink-0">How it works</span>
          </h2>

          <ol className="ruled border-t border-[hsl(var(--rule))]">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="grid grid-cols-[3rem_1fr] items-baseline gap-x-5 py-7 sm:grid-cols-[5rem_1fr] sm:gap-x-8 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.15fr)]"
              >
                <span className="figure text-4xl text-ink-4 sm:text-5xl">{s.n}</span>
                <h3 className="text-balance font-display text-display-4 text-ink-1">{s.label}</h3>
                <p className="col-start-2 mt-2 max-w-measure text-pretty text-base leading-relaxed text-ink-3 md:col-start-3 md:mt-0">
                  {s.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Capabilities ──────────────────────────────────────
            Own ground, not another row of cards on the page plane. */}
        <section className="mt-24 border-y border-border bg-surface-1 py-20 sm:mt-32 sm:py-24">
          <div className={CONTAINER}>
            <div className="mb-14 max-w-measure">
              <span className="accent-bar mb-6" />
              <h2 className="text-balance font-display text-display-3 text-ink-1">
                Everything the spreadsheet was doing badly.
              </h2>
            </div>

            <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2">
              {CAPABILITIES.map((c) => (
                <div key={c.n} className="border-t border-[hsl(var(--rule))] pt-6">
                  <span className="kicker text-primary">{c.n}</span>
                  <h3 className="mt-3 font-display text-display-4 text-ink-1">
                    {c.title}
                  </h3>
                  <p className="mt-3 max-w-measure text-pretty leading-relaxed text-ink-3">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Close ─────────────────────────────────────────────
            Type on the page. The old close was a fourth identical card. */}
        <section className={`${CONTAINER} py-24 sm:py-32`}>
          <div className="max-w-measure">
            <h2 className="text-balance font-display text-display-2 text-ink-1">
              Your week is already planned.
              <br />
              <span className="text-ink-4">You just haven't seen it yet.</span>
            </h2>
            <div className="mt-10">
              <Button size="lg" asChild>
                <Link to="/signup">
                  Get started — it's free
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={`${CONTAINER} flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between`}>
          <Wordmark />
          <div className="flex items-center gap-6 text-sm text-ink-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Log in
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <span className="text-ink-4">© {new Date().getFullYear()} Crammed</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
