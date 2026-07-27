import { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarRange, LogOut, Award,
  AlertTriangle, Plus, X, Target, BookOpen, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import {
  api,
  type GradeSummary, type CourseStat, type Grade, type ScheduleItem,
} from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────

function gradeColor(avg: number | null): string {
  if (avg === null) return "text-muted-foreground";
  if (avg >= 89.5) return "text-green-400";
  if (avg >= 79.5) return "text-blue-400";
  if (avg >= 69.5) return "text-yellow-400";
  if (avg >= 59.5) return "text-orange-400";
  return "text-red-400";
}

function gradeBarColor(avg: number | null): string {
  if (avg === null) return "bg-muted";
  if (avg >= 89.5) return "bg-green-400";
  if (avg >= 79.5) return "bg-blue-400";
  if (avg >= 69.5) return "bg-yellow-400";
  if (avg >= 59.5) return "bg-orange-400";
  return "bg-red-400";
}

function displayCat(cat: string | null): string {
  if (!cat) return "—";
  // "sv:hw_formative" → "HW Formative", "sv:summative" → "Summative"
  return cat
    .replace(/^sv:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface CategoryStat {
  label: string;
  avg: number;
  pts: number;
  maxPts: number;
  weight?: number;
}

function calcCategories(grades: Grade[]): CategoryStat[] {
  const svGrades = grades.filter(
    (g) =>
      (g.category ?? "").startsWith("sv:") &&
      g.score !== null &&
      g.max_score !== null &&
      parseFloat(String(g.max_score)) > 0
  );

  if (svGrades.length > 0) {
    // Group every distinct sv: category into its own bar.
    // Then annotate with a hint weight if the category name contains "summative" (70%)
    // or "formative" (30% total shared across all formative sub-categories).
    const catMap = new Map<string, { pts: number; max: number }>();
    for (const g of svGrades) {
      const key = g.category!;
      const e = catMap.get(key) ?? { pts: 0, max: 0 };
      catMap.set(key, {
        pts: e.pts + parseFloat(String(g.score)),
        max: e.max + parseFloat(String(g.max_score)),
      });
    }

    // Sort: summative first, then formative variants alphabetically
    const sorted = [...catMap.entries()].sort(([a], [b]) => {
      const aIsSum = a.includes("summative");
      const bIsSum = b.includes("summative");
      if (aIsSum && !bIsSum) return -1;
      if (!aIsSum && bIsSum) return 1;
      return a.localeCompare(b);
    });

    return sorted.map(([cat, { pts, max }]) => {
      const isSum = cat.includes("summative");
      const isForm = cat.includes("formative");
      return {
        label: displayCat(cat),
        avg: (pts / max) * 100,
        pts,
        maxPts: max,
        weight: isSum ? 0.7 : isForm ? 0.3 : undefined,
      };
    });
  }

  // Non-FCPS: group by category label
  const catMap = new Map<string, { pts: number; max: number }>();
  for (const g of grades) {
    if (g.score === null || g.max_score === null || parseFloat(String(g.max_score)) === 0) continue;
    const key = displayCat(g.category);
    const e = catMap.get(key) ?? { pts: 0, max: 0 };
    catMap.set(key, {
      pts: e.pts + parseFloat(String(g.score)),
      max: e.max + parseFloat(String(g.max_score)),
    });
  }
  return [...catMap.entries()].map(([label, { pts, max }]) => ({
    label, avg: (pts / max) * 100, pts, maxPts: max,
  }));
}

// ── GPA Ring ─────────────────────────────────────────────────

const RING_R = 60;
const CIRC = 2 * Math.PI * RING_R;

function GPARing({ gpa }: { gpa: number }) {
  const pct = Math.min(gpa / 5.0, 1);
  const filled = pct * CIRC;
  const color = gpa >= 3.5 ? "#4ade80" : gpa >= 3.0 ? "#60a5fa" : gpa >= 2.5 ? "#fb923c" : "#f87171";
  return (
    <svg width="148" height="148" viewBox="0 0 148 148">
      <circle cx="74" cy="74" r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
      <circle cx="74" cy="74" r={RING_R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRC}`} transform="rotate(-90 74 74)"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x="74" y="68" textAnchor="middle" fill="#f1f5f9" fontSize="28" fontWeight="800" fontFamily="sans-serif">
        {gpa.toFixed(2)}
      </text>
      <text x="74" y="88" textAnchor="middle" fill="#94a3b8" fontSize="12" fontFamily="sans-serif">WGPA</text>
    </svg>
  );
}

// ── Grade Trend Chart ─────────────────────────────────────────

function TrendChart({ grades }: { grades: Grade[] }) {
  // Build data points: sort by graded_at, compute running avg after each item
  const scored = grades
    .filter((g) => g.graded_at && g.score !== null && g.max_score && parseFloat(String(g.max_score)) > 0)
    .sort((a, b) => (a.graded_at! > b.graded_at! ? 1 : -1));

  if (scored.length < 2) return null;

  // Running cumulative average (total pts / total max)
  const points: { date: string; avg: number }[] = [];
  let totalPts = 0, totalMax = 0;
  for (const g of scored) {
    totalPts += parseFloat(String(g.score));
    totalMax += parseFloat(String(g.max_score));
    points.push({ date: g.graded_at!.slice(0, 10), avg: (totalPts / totalMax) * 100 });
  }

  const W = 400, H = 80, PAD = { t: 10, r: 8, b: 20, l: 36 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const minY = Math.max(0, Math.min(...points.map((p) => p.avg)) - 5);
  const maxY = Math.min(100, Math.max(...points.map((p) => p.avg)) + 5);
  const rangeY = maxY - minY || 1;

  const toX = (i: number) => PAD.l + (i / (points.length - 1)) * innerW;
  const toY = (v: number) => PAD.t + innerH - ((v - minY) / rangeY) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.avg).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${PAD.l},${(PAD.t + innerH).toFixed(1)} Z`;

  const lastAvg = points[points.length - 1].avg;
  const firstAvg = points[0].avg;
  const trend = lastAvg - firstAvg;
  const lineColor = lastAvg >= 90 ? "#4ade80" : lastAvg >= 80 ? "#60a5fa" : lastAvg >= 70 ? "#facc15" : "#fb923c";

  // Y-axis gridlines at round numbers
  const gridYs = Array.from({ length: 5 }, (_, i) => Math.round(minY + (rangeY / 4) * i));

  return (
    <div className="px-5 py-3 border-b border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Grade Trend</span>
        <span className={`text-[11px] font-semibold ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}% over {points.length} grades
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id={`tg-${lineColor.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Gridlines */}
        {gridYs.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l} y1={toY(v).toFixed(1)}
              x2={W - PAD.r} y2={toY(v).toFixed(1)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1"
            />
            <text x={PAD.l - 4} y={toY(v) + 3} textAnchor="end" fill="#64748b" fontSize="8">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill={`url(#tg-${lineColor.replace("#","")})`} />
        {/* Line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(i).toFixed(1)} cy={toY(p.avg).toFixed(1)} r="2.5"
            fill={i === points.length - 1 ? lineColor : "transparent"}
            stroke={lineColor} strokeWidth="1.5"
          />
        ))}
        {/* Date labels: first and last */}
        <text x={PAD.l} y={H} textAnchor="start" fill="#64748b" fontSize="8">
          {points[0].date.slice(5)}
        </text>
        <text x={W - PAD.r} y={H} textAnchor="end" fill="#64748b" fontSize="8">
          {points[points.length - 1].date.slice(5)}
        </text>
      </svg>
    </div>
  );
}

// ── Inline Score Field ────────────────────────────────────────

function InlineScoreField({
  grade, onSaved,
}: {
  grade: Grade;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(grade.score !== null ? String(grade.score) : "");
  const [maxScore, setMaxScore] = useState(grade.max_score !== null ? String(grade.max_score) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  const save = useCallback(async () => {
    if (!token) return;
    const newScore = score !== "" ? parseFloat(score) : null;
    const newMax = maxScore !== "" ? parseFloat(maxScore) : null;
    setEditing(false);
    try {
      await api.updateGrade(token, grade.id, { score: newScore, max_score: newMax });
      onSaved();
    } catch {
      setScore(grade.score !== null ? String(grade.score) : "");
      setMaxScore(grade.max_score !== null ? String(grade.max_score) : "");
    }
  }, [token, grade.id, grade.score, grade.max_score, score, maxScore, onSaved]);

  const pct =
    grade.score !== null && grade.max_score && parseFloat(String(grade.max_score)) > 0
      ? (parseFloat(String(grade.score)) / parseFloat(String(grade.max_score))) * 100
      : null;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} type="number" value={score}
          onChange={(e) => setScore(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-muted-foreground text-xs">/</span>
        <input type="number" value={maxScore}
          onChange={(e) => setMaxScore(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </span>
    );
  }

  return (
    <span
      className={`cursor-pointer hover:underline hover:decoration-dotted ${gradeColor(pct)}`}
      onClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
      title="Click to edit"
    >
      {grade.score !== null ? `${grade.score}/${grade.max_score}` : "—"}
    </span>
  );
}

// ── Category Progress Bar ─────────────────────────────────────

function CategoryBar({ label, avg, pts, maxPts, weight }: CategoryStat) {
  const pct = Math.min(Math.round(avg * 10) / 10, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground/80">
          {label}{weight !== undefined ? ` (${Math.round(weight * 100)}%)` : ""}
        </span>
        <span className={`font-bold ${gradeColor(avg)}`}>
          {pct.toFixed(1)}%
          <span className="text-muted-foreground font-normal ml-1.5">
            {pts.toFixed(1)}/{maxPts.toFixed(1)}
          </span>
        </span>
      </div>
      <div className="h-5 w-full rounded-full bg-muted/40 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ${gradeBarColor(avg)} flex items-center pl-2`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        >
          {pct > 15 && (
            <span className="text-[10px] font-semibold text-white/90">{pct.toFixed(1)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Grade Modal ───────────────────────────────────────────

const CATEGORIES = ["exam", "quiz", "homework", "essay", "project", "participation", "summative", "formative", "other"];

function AddGradeModal({
  isOpen, onClose, onSaved, defaultCourse, courseNames,
}: {
  isOpen: boolean; onClose: () => void; onSaved: () => void;
  defaultCourse?: string; courseNames: string[];
}) {
  const { token } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    courseName: defaultCourse ?? "", title: "", score: "",
    maxScore: "100", category: "exam", gradedAt: today,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm((f) => ({ ...f, courseName: defaultCourse ?? f.courseName, gradedAt: today }));
      setError(null);
    }
  }, [isOpen, defaultCourse, today]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!token) return;
    if (!form.courseName.trim() || !form.title.trim()) { setError("Course and title are required."); return; }
    setSaving(true); setError(null);
    try {
      await api.createGrade(token, {
        course_name: form.courseName.trim(), title: form.title.trim(),
        score: form.score ? parseFloat(form.score) : null,
        max_score: form.maxScore ? parseFloat(form.maxScore) : null,
        weight: 1.0, category: form.category || null,
        graded_at: form.gradedAt || null, schedule_item_id: null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally { setSaving(false); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div className="relative z-10 bg-card border border-border rounded-xl w-full max-w-md animate-fade-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-display text-base font-bold">Add Grade</h2>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Course</Label>
            <Input list="add-course-list" placeholder="e.g. Calculus BC" value={form.courseName}
              onChange={(e) => set("courseName", e.target.value)} />
            <datalist id="add-course-list">
              {courseNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Assignment / Exam title</Label>
            <Input placeholder="e.g. Chapter 5 Test" value={form.title}
              onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Score earned</Label>
              <Input type="number" min={0} placeholder="87.5" value={form.score}
                onChange={(e) => set("score", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Out of</Label>
              <Input type="number" min={1} placeholder="100" value={form.maxScore}
                onChange={(e) => set("maxScore", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.gradedAt}
                onChange={(e) => set("gradedAt", e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-2 p-5 border-t border-border">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Grade"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Course Card (expandable) ──────────────────────────────────

function CourseCard({
  course, grades, onAddGrade, onDeleteGrade, onGradeUpdated,
}: {
  course: CourseStat;
  grades: Grade[];
  onAddGrade: (courseName: string) => void;
  onDeleteGrade: (id: string) => void;
  onGradeUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cats = calcCategories(grades);
  const sortedGrades = [...grades].sort((a, b) => {
    if (a.graded_at && b.graded_at) return b.graded_at.localeCompare(a.graded_at);
    return 0;
  });

  return (
    <div className={`bg-card border border-border rounded-xl transition-all ${expanded ? "ring-1 ring-primary/30" : ""}`}>
      {/* ── Card header ── */}
      <div className="p-5 cursor-pointer select-none" onClick={() => setExpanded((e) => !e)}>
        {/* Course name row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-sm leading-snug truncate">{course.name}</h3>
            {course.fullName && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{course.fullName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {course.average !== null ? (
              <div className="text-right">
                <span className={`text-2xl font-extrabold font-display leading-none ${gradeColor(course.average)}`}>
                  {course.letterGrade ?? "—"}
                </span>
                <span className={`text-sm font-semibold ml-1.5 ${gradeColor(course.average)}`}>
                  {course.average.toFixed(1)}%
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No grades</span>
            )}
            {expanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          </div>
        </div>

        {/* Overall progress bar */}
        {course.average !== null ? (
          <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${gradeBarColor(course.average)}`}
              style={{ width: `${Math.min(course.average, 100)}%` }}
            />
          </div>
        ) : (
          <div className="h-2 w-full rounded-full bg-muted/20 mb-2" />
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{grades.length} grade{grades.length !== 1 ? "s" : ""} · {course.creditHours} cr</span>
          {course.targetGrade && course.average !== null && (
            <span className={`flex items-center gap-1 font-medium ${course.onTrack ? "text-green-400" : "text-orange-400"}`}>
              {course.onTrack
                ? <CheckCircle2 className="h-3 w-3" />
                : <AlertTriangle className="h-3 w-3" />}
              {course.onTrack ? `On track for ${course.targetGrade}` : `Below ${course.targetGrade}`}
            </span>
          )}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-border">
          {/* Category bars */}
          {cats.length > 0 && (
            <div className="px-5 pt-4 pb-3 space-y-3 border-b border-border/50">
              {cats.map((c) => (
                <CategoryBar key={c.label} {...c} />
              ))}
              {/* Total bar */}
              {course.average !== null && (
                <div className="space-y-1 pt-1 border-t border-border/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">Total</span>
                    <span className={`font-bold ${gradeColor(course.average)}`}>
                      {course.average.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-5 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${gradeBarColor(course.average)} flex items-center pl-2`}
                      style={{ width: `${Math.min(course.average, 100)}%` }}
                    >
                      {course.average > 15 && (
                        <span className="text-[10px] font-semibold text-white/90">
                          {course.average.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trend chart */}
          <TrendChart grades={grades} />

          {/* Assignment table */}
          {sortedGrades.length === 0 ? (
            <p className="px-5 py-4 text-xs text-muted-foreground">No grades recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Assignment</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Score</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">%</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Category</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Date</th>
                    <th className="px-4 py-2.5 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {sortedGrades.map((g, idx) => {
                    const pct =
                      g.score !== null && g.max_score && parseFloat(String(g.max_score)) > 0
                        ? (parseFloat(String(g.score)) / parseFloat(String(g.max_score))) * 100
                        : null;
                    return (
                      <tr
                        key={g.id}
                        className={`border-b border-border/30 hover:bg-muted/10 group ${idx % 2 === 1 ? "bg-muted/[0.03]" : ""}`}
                      >
                        <td className="px-4 py-2 font-medium max-w-[200px] truncate">{g.title}</td>
                        <td className="px-4 py-2 text-center">
                          <InlineScoreField grade={g} onSaved={onGradeUpdated} />
                        </td>
                        <td className={`px-4 py-2 text-center font-bold ${gradeColor(pct)}`}>
                          {pct !== null ? `${pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{displayCat(g.category)}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {g.graded_at?.slice(0, 10) ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteGrade(g.id); }}
                            className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all rounded"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add grade row */}
          <div className="px-4 py-3 border-t border-border/50">
            <Button size="sm" variant="outline" className="text-xs"
              onClick={(e) => { e.stopPropagation(); onAddGrade(course.name); }}>
              <Plus className="h-3 w-3 mr-1.5" />
              Add Grade
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GPA Calculator Modal ──────────────────────────────────────

function GpaCalcModal({
  isOpen, onClose, courses,
}: {
  isOpen: boolean; onClose: () => void; courses: CourseStat[];
}) {
  const [weighted, setWeighted] = useState<Record<string, boolean>>({});

  const gpa = (() => {
    let wSum = 0, tc = 0;
    for (const c of courses) {
      if (c.average === null) continue;
      const bonus = weighted[c.name] ? 1.0 : 0.0;
      wSum += Math.min(5.0, c.gpaPoints + bonus) * c.creditHours;
      tc += c.creditHours;
    }
    return tc > 0 ? Math.round((wSum / tc) * 100) / 100 : 0;
  })();

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div className="relative z-10 bg-card border border-border rounded-xl w-full max-w-md animate-fade-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-base font-bold">GPA Calculator</h2>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="text-center mb-5">
            <span className="text-4xl font-bold font-display">{gpa.toFixed(2)}</span>
            <span className="text-muted-foreground text-sm ml-2">Weighted GPA</span>
          </div>
          <div className="space-y-1">
            {courses.filter((c) => c.average !== null).map((c) => (
              <div key={c.name} className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold w-7 ${gradeColor(c.average)}`}>{c.letterGrade}</span>
                  <span className="text-sm font-medium">{c.name}</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-muted-foreground">+1.0 weighted</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer"
                      checked={weighted[c.name] ?? false}
                      onChange={(e) => setWeighted((w) => ({ ...w, [c.name]: e.target.checked }))} />
                    <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-border">
          <Button className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function GradesPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<GradeSummary | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addCourse, setAddCourse] = useState<string | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [gpaOpen, setGpaOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [summaryRes, gradesRes, scheduleRes] = await Promise.all([
        api.getGradeSummary(token),
        api.getGrades(token),
        api.getSchedule(token),
      ]);
      setSummary(summaryRes);
      setGrades(gradesRes.grades);
      setScheduleItems(scheduleRes.items);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogout = async () => {
    if (token) await api.logout(token).catch(() => {});
    logout();
    navigate("/");
  };

  const handleSyncGrades = async () => {
    if (!token) return;
    setSyncing(true); setSyncMsg(null);
    try {
      const { synced, courses, message } = await api.syncStudentVueGrades(token);
      setSyncMsg(synced > 0
        ? `✓ Synced ${synced} course${synced !== 1 ? "s" : ""}: ${courses.join(", ")}`
        : (message ?? "No grade data found on StudentVUE."));
      loadData();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed. Is StudentVUE connected?");
    } finally { setSyncing(false); }
  };

  const handleDeleteGrade = async (id: string) => {
    if (!token) return;
    setGrades((prev) => prev.filter((g) => g.id !== id));
    await api.deleteGrade(token, id).catch(() => {});
    loadData();
  };

  const openAddGrade = (courseName?: string) => {
    setAddCourse(courseName);
    setAddOpen(true);
  };

  const courseNames = [...new Set([
    ...(summary?.courses.map((c) => c.name) ?? []),
    ...scheduleItems.filter((i) => i.category === "class").map((i) => i.title),
  ])].sort();

  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">

      {/* Nav */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CalendarRange className="h-4 w-4 text-primary" />
            </div>
            <span className="font-display font-bold text-base hidden sm:block">AutoPlanner</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/today">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs">Today's Plan</Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs">Schedule</Button>
            </Link>
            <Button variant="ghost" size="sm" className="text-foreground text-xs bg-muted/40">
              <Award className="h-3.5 w-3.5 mr-1.5" />Grades
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-foreground">
            {initials}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 pb-24">
        {/* Header + toolbar */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold">Grades</h1>
            <p className="text-sm text-muted-foreground mt-1">FCPS weighted GPA · AP +1.0 · Honors +0.5</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setGpaOpen(true)} className="text-xs">
              GPA Calc
            </Button>
            <Button variant="outline" size="sm" onClick={handleSyncGrades} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync StudentVUE"}
            </Button>
            <Button onClick={() => openAddGrade()} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />Add Grade
            </Button>
          </div>
        </div>

        {/* Sync status */}
        {syncMsg && (
          <div className={`mb-5 bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-2 text-xs ${
            syncMsg.startsWith("✓") ? "border-green-500/30 bg-green-500/[0.05]" : "border-orange-500/30 bg-orange-500/[0.05]"
          }`}>
            <span className={syncMsg.startsWith("✓") ? "text-green-400" : "text-orange-400"}>{syncMsg}</span>
            <button onClick={() => setSyncMsg(null)} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6">
                <div className="skeleton h-6 w-48 rounded-lg mb-3" />
                <div className="skeleton h-4 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* GPA summary */}
            {summary?.overallGPA != null && (
              <div className="bg-card border border-border rounded-xl p-5 mb-8 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <GPARing gpa={summary.overallGPA} />
                </div>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                  <div className="text-center">
                    <div className="text-2xl font-bold font-display">{summary.overallGPA.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Overall GPA</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-display">{summary.totalCredits}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Credits</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-display">{summary.courses.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Courses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-display">
                      {summary.courses.filter((c) => c.average !== null && c.average >= 90).length}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">A-range</div>
                  </div>
                </div>
              </div>
            )}

            {/* Courses needing attention */}
            {(summary?.courses ?? []).filter((c) => !c.onTrack && c.average !== null).length > 0 && (
              <div className="bg-card border border-border border-l-4 border-l-orange-500 rounded-xl p-3 mb-5 space-y-1">
                <p className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />Needs attention
                </p>
                {(summary?.courses ?? []).filter((c) => !c.onTrack && c.average !== null).map((c) => (
                  <p key={c.name} className="text-xs text-muted-foreground pl-5">
                    {c.name}: {c.average?.toFixed(1)}% — below {c.targetGrade} target
                  </p>
                ))}
              </div>
            )}

            {/* Course cards */}
            {(summary?.courses ?? []).length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                <h3 className="font-display font-bold text-lg mb-2">No grades yet</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Add your first grade or sync from StudentVUE.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={handleSyncGrades} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                    Sync StudentVUE
                  </Button>
                  <Button onClick={() => openAddGrade()}>
                    <Plus className="h-4 w-4 mr-1.5" />Add Grade
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(summary?.courses ?? []).map((course) => (
                  <CourseCard
                    key={course.name}
                    course={course}
                    grades={grades.filter((g) => g.course_name === course.name)}
                    onAddGrade={openAddGrade}
                    onDeleteGrade={handleDeleteGrade}
                    onGradeUpdated={loadData}
                  />
                ))}
              </div>
            )}

            {/* Target grade tip */}
            {(summary?.courses ?? []).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 mt-6">
                <Target className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Set target grades for each course so the AI planner prioritizes the right subjects.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 lg:hidden border-t border-border bg-background/80 backdrop-blur-xl flex">
        {[
          { to: "/today", icon: CalendarRange, label: "Today" },
          { to: "/dashboard", icon: BookOpen, label: "Schedule" },
          { to: "/grades", icon: Award, label: "Grades" },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-[10px] transition-colors ${
            to === "/grades" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}>
            <Icon className="h-5 w-5" />{label}
          </Link>
        ))}
      </nav>

      <AddGradeModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); loadData(); }}
        defaultCourse={addCourse}
        courseNames={courseNames}
      />

      <GpaCalcModal
        isOpen={gpaOpen}
        onClose={() => setGpaOpen(false)}
        courses={summary?.courses ?? []}
      />
    </div>
  );
}
