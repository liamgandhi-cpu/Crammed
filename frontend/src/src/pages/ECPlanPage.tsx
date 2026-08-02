import { useId, useState, useEffect, useCallback } from "react";
import { Sparkles, Trash2, Clock, ArrowRight, AlertTriangle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppNav, { APP_CONTAINER, MobileNavSpacer } from "@/components/AppNav";
import { useAuth } from "@/context/AuthContext";
import {
  api,
  ApiError,
  EC_CATEGORIES,
  type EcPlanItem,
  type EcCategory,
  type AiUsage,
} from "@/lib/api";

const YEARS = [9, 10, 11, 12] as const;

const YEAR_LABELS: Record<number, string> = {
  9: "Freshman year",
  10: "Sophomore year",
  11: "Junior year",
  12: "Senior year",
};

/* Categories reuse the shared categorical tokens rather than introducing a
   second palette — the same greens and blues that mean "free" and "study" on
   the planner keep their meaning here. */
const CATEGORY_STYLE: Record<EcCategory, string> = {
  leadership: "bg-cat-class/15 text-cat-class",
  service: "bg-cat-free/15 text-cat-free",
  research: "bg-cat-study/15 text-cat-study",
  arts: "bg-cat-week/15 text-cat-week",
  athletics: "bg-cat-warn/15 text-cat-warn",
  work: "bg-cat-due/15 text-cat-due",
  competition: "bg-cat-class/15 text-cat-class",
  project: "bg-cat-study/15 text-cat-study",
};

function categoryLabel(c: EcCategory): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * A cleared number input reads as "", and Number("") is 0 — which the generate
 * endpoint rejects, since it requires at least one hour. Anything unparseable
 * is NaN, which serializes to null and fails validation the same way. Clamp
 * into the range the server accepts so the field can't produce a 400.
 */
function clampedNumber(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ── Plan item card ───────────────────────────────────────────

function PlanItemCard({
  item,
  onDelete,
}: {
  item: EcPlanItem;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <article className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink-1">
          {item.title}
        </h3>
        <button
          onClick={() => {
            setDeleting(true);
            onDelete(item.id);
          }}
          disabled={deleting}
          aria-label={`Remove ${item.title}`}
          className="-m-1 shrink-0 rounded-md p-1 text-ink-4 transition-colors hover:bg-surface-3 hover:text-cat-due focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${CATEGORY_STYLE[item.category]}`}
        >
          {categoryLabel(item.category)}
        </span>
        {item.hours_per_week !== null && (
          <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-ink-3">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {item.hours_per_week} hrs/wk
          </span>
        )}
      </div>

      {item.why && (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">{item.why}</p>
      )}

      {item.first_step && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-border/70 pt-3 text-[0.8125rem] leading-relaxed text-ink-3">
          <ArrowRight
            className="mt-[0.1875rem] h-3.5 w-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold text-ink-2">First step: </span>
            {item.first_step}
          </span>
        </p>
      )}
    </article>
  );
}

// ── Generation form ──────────────────────────────────────────

function GenerateForm({
  usage,
  busy,
  hasPlan,
  onGenerate,
}: {
  usage: AiUsage | null;
  busy: boolean;
  hasPlan: boolean;
  onGenerate: (opts: {
    currentYear: number;
    interests: string;
    hoursPerWeek: number;
  }) => void;
}) {
  const yearId = useId();
  const interestsId = useId();
  const hoursId = useId();

  const [currentYear, setCurrentYear] = useState(9);
  const [interests, setInterests] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState(8);

  const tooShort = interests.trim().length < 10;
  const outOfCalls = usage !== null && usage.remaining === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (tooShort || busy || outOfCalls) return;
        if (
          hasPlan &&
          !window.confirm(
            "Generating replaces your current plan. Anything you've added by hand will be lost. Continue?"
          )
        ) {
          return;
        }
        onGenerate({ currentYear, interests: interests.trim(), hoursPerWeek });
      }}
      className="rounded-2xl border border-border bg-surface-2 p-5 sm:p-6"
    >
      <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-ink-1">
        Build a plan
      </h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-3">
        Uses the courses and activities already on your schedule, so the plan
        builds on what you're doing rather than starting from nothing.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={yearId}>Current grade</Label>
          <select
            id={yearId}
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface-3 px-3 text-sm text-ink-1 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}th grade — {YEAR_LABELS[y]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor={hoursId}>Hours a week, all activities</Label>
          <Input
            id={hoursId}
            type="number"
            min={1}
            max={40}
            value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(clampedNumber(e.target.value, 1, 40, 1))}
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor={interestsId}>What are you into?</Label>
        <textarea
          id={interestsId}
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Subjects you like, anything you already do outside class, what you're curious about, what you'd rather avoid."
          className="mt-1.5 w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm leading-relaxed text-ink-1 placeholder:text-ink-4 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
        />
        <p className="mt-1.5 text-xs text-ink-4">
          The more specific this is, the less generic the plan.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={tooShort || busy || outOfCalls}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Building…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {hasPlan ? "Rebuild plan" : "Generate plan"}
            </>
          )}
        </Button>

        {usage !== null && (
          <span className="text-[0.8125rem] text-ink-3">
            {usage.remaining} of {usage.limit} generations left today
          </span>
        )}
      </div>
    </form>
  );
}

// ── Add one by hand ──────────────────────────────────────────

/* Without this the only way to change the plan is to regenerate it, which
   costs a daily generation and throws away everything else in the plan to
   change one line. */
function AddActivityForm({
  onAdd,
}: {
  onAdd: (item: {
    title: string;
    year: number;
    category: EcCategory;
    hours_per_week: number;
  }) => Promise<void>;
}) {
  const titleId = useId();
  const yearId = useId();
  const catId = useId();
  const hoursId = useId();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(9);
  const [category, setCategory] = useState<EcCategory>("leadership");
  const [hours, setHours] = useState(2);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:border-ink-4/70 hover:bg-surface-2 hover:text-ink-1 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add an activity yourself
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
          await onAdd({ title: title.trim(), year, category, hours_per_week: hours });
          setTitle("");
          setOpen(false);
        } finally {
          setSaving(false);
        }
      }}
      className="mt-4 rounded-2xl border border-border bg-surface-2 p-5"
    >
      <h2 className="font-display text-base font-bold tracking-[-0.02em] text-ink-1">
        Add an activity
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={titleId}>What is it?</Label>
          <Input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tutor algebra at the public library"
            maxLength={255}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={yearId}>Grade</Label>
          <select
            id={yearId}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface-3 px-3 text-sm text-ink-1 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {YEAR_LABELS[y]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor={catId}>Category</Label>
          <select
            id={catId}
            value={category}
            onChange={(e) => setCategory(e.target.value as EcCategory)}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface-3 px-3 text-sm text-ink-1 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
          >
            {EC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor={hoursId}>Hours a week</Label>
          <Input
            id={hoursId}
            type="number"
            min={0}
            max={40}
            value={hours}
            onChange={(e) => setHours(clampedNumber(e.target.value, 0, 40, 0))}
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button type="submit" disabled={!title.trim() || saving}>
          {saving ? "Adding…" : "Add to plan"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function ECPlanPage() {
  const { token } = useAuth();

  const [items, setItems] = useState<EcPlanItem[]>([]);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    api
      .getEcPlan(token)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setUsage(res.usage);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? `Couldn't load your plan — ${err.message}`
            : "Couldn't load your plan. Refresh to try again."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleGenerate = useCallback(
    async (opts: { currentYear: number; interests: string; hoursPerWeek: number }) => {
      if (!token) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.generateEcPlan(token, opts);
        setItems(res.items);
        setUsage(res.usage);
      } catch (err) {
        // A 429 carries the server's cap message and the updated usage, so
        // surface both rather than a generic failure.
        if (err instanceof ApiError) {
          setError(err.message);
          if (err.status === 429) {
            setUsage((u) => (u ? { ...u, remaining: 0, allowed: false } : u));
          }
        } else {
          setError("Something went wrong building your plan. Try again.");
        }
      } finally {
        setBusy(false);
      }
    },
    [token]
  );

  const handleAdd = useCallback(
    async (item: {
      title: string;
      year: number;
      category: EcCategory;
      hours_per_week: number;
    }) => {
      if (!token) return;
      setError(null);
      try {
        const res = await api.addEcPlanItem(token, {
          ...item,
          why: null,
          first_step: null,
        });
        setItems((cur) => [...cur, res.item]);
      } catch (err) {
        // Show what the server actually said. Replacing it with generic copy
        // hid a "relation does not exist" behind "try again", which is not a
        // thing the reader can act on.
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't add that activity. Check your connection and try again."
        );
      }
    },
    [token]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!token) return;
      const previous = items;
      setItems((cur) => cur.filter((i) => i.id !== id));
      try {
        await api.deleteEcPlanItem(token, id);
      } catch (err) {
        setItems(previous);
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't remove that item. Check your connection and try again."
        );
      }
    },
    [token, items]
  );

  const byYear = YEARS.map((year) => ({
    year,
    items: items.filter((i) => i.year === year),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <AppNav />

      <main className={`${APP_CONTAINER} py-8`}>
        <header className="mb-7">
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-ink-1 sm:text-3xl">
            Extracurricular plan
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-3">
            A four-year sketch of how to spend time outside class — what to
            start, what to stick with, and the first move for each.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2.5 rounded-xl border border-cat-due/40 bg-cat-due/10 px-4 py-3 text-sm text-ink-1"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-cat-due"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        )}

        <GenerateForm
          usage={usage}
          busy={busy}
          hasPlan={items.length > 0}
          onGenerate={handleGenerate}
        />

        <AddActivityForm onAdd={handleAdd} />

        {loading ? (
          <p className="mt-8 text-sm text-ink-3">Loading your plan…</p>
        ) : byYear.length === 0 ? (
          <p className="mt-8 max-w-md text-sm leading-relaxed text-ink-3">
            No plan yet. Fill in the form above and generate one — you can
            delete anything that doesn't fit afterwards.
          </p>
        ) : (
          <div className="mt-9 space-y-9">
            {byYear.map(({ year, items: yearItems }) => {
              const totalHours = yearItems.reduce(
                (sum, i) => sum + (i.hours_per_week ?? 0),
                0
              );
              return (
                <section key={year}>
                  <div className="mb-3.5 flex items-baseline justify-between gap-4 border-b border-border pb-2.5">
                    <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-ink-1">
                      {YEAR_LABELS[year]}
                    </h2>
                    <span className="text-[0.8125rem] font-medium text-ink-3">
                      {Math.round(totalHours * 10) / 10} hrs/wk
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {yearItems.map((item) => (
                      <PlanItemCard key={item.id} item={item} onDelete={handleDelete} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <MobileNavSpacer />
    </div>
  );
}
