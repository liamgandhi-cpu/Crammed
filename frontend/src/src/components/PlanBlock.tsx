import {
  CheckCircle2, Circle, Music,
  BookOpen, Brain, PencilLine, Coffee, ClipboardList, FileText, Target, UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { PlanBlock as PlanBlockType } from "@/lib/api";

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const dh = h % 12 === 0 ? 12 : h % 12;
  return `${dh}:${String(m).padStart(2, "0")} ${period}`;
}

function durationMins(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

/**
 * Line icons, not emoji.
 *
 * These were 📚 🧠 ✏️ ☕ 📋 📝 🎯 🍽️ rendered at `text-base`. Emoji are the
 * loudest, most saturated thing that can appear in a dark editorial UI —
 * each one arrives with its own palette, none of which is this product's —
 * and they render differently on every platform, so the block's right edge
 * was a different size and colour on Windows, macOS and Android. Lucide
 * strokes inherit `currentColor`, so they take the block's own category tint.
 */
const TYPE_ICON: Record<string, LucideIcon> = {
  class: BookOpen,
  study: Brain,
  assignment: PencilLine,
  break: Coffee,
  prep: ClipboardList,
  exam: FileText,
  free: Target,
  meal: UtensilsCrossed,
};

const PRIORITY: Record<string, { tone: string; label: string }> = {
  high:   { tone: "bg-cat-due",  label: "High priority" },
  medium: { tone: "bg-cat-warn", label: "Medium priority" },
  low:    { tone: "bg-cat-free", label: "Low priority" },
};

const FOCUS_TYPES = new Set(["study", "assignment", "prep", "exam"]);

interface Props {
  block: PlanBlockType;
  onToggle: (id: string, completed: boolean) => void;
  isPast: boolean;
  isCurrent: boolean;
  onPlayMusic?: () => void;
}

export default function PlanBlock({ block, onToggle, isPast, isCurrent, onPlayMusic }: Props) {
  const dim = block.completed || isPast;
  const mins = durationMins(block.startTime, block.endTime);
  const Icon = TYPE_ICON[block.type] ?? Target;
  const priority = PRIORITY[block.priority] ?? PRIORITY.low;

  const duration = mins >= 60
    ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ""}`
    : `${mins}m`;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all duration-300 ${
        isCurrent ? "shadow-elev-2" : "hover:shadow-elev-1"
      } ${dim ? "opacity-55" : ""}`}
      style={{
        backgroundColor: `${block.color}0f`,
        borderColor: isCurrent ? `${block.color}66` : `${block.color}26`,
      }}
    >
      {/* Category accent. 3px, flush — the old one was a 4px bar with
          `rounded-l-2xl` on a `rounded-2xl` parent that already clipped it,
          so the radius did nothing but soften the join. */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: block.color }}
        aria-hidden="true"
      />

      <div className="flex items-start gap-3 py-3 pl-4 pr-3">
        <button
          onClick={() => onToggle(block.id, !block.completed)}
          aria-pressed={block.completed}
          aria-label={`Mark "${block.title}" ${block.completed ? "not done" : "done"}`}
          className="mt-0.5 shrink-0 rounded-full transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ color: block.completed ? block.color : undefined }}
        >
          {block.completed ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Circle className="h-5 w-5 text-ink-4 transition-colors group-hover:text-ink-3" aria-hidden="true" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`text-[0.9375rem] font-semibold leading-snug ${
                block.completed ? "text-ink-4 line-through" : ""
              }`}
              style={{ color: block.completed ? undefined : block.color }}
            >
              {block.title}
            </span>
            {isCurrent && (
              <span
                className="rounded-full border px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.14em]"
                style={{
                  color: block.color,
                  borderColor: `${block.color}66`,
                  backgroundColor: `${block.color}1a`,
                }}
              >
                Now
              </span>
            )}
          </div>

          <p className="mt-1 flex items-center gap-2 text-micro text-ink-3">
            <time className="font-mono">
              {formatTime(block.startTime)} – {formatTime(block.endTime)}
            </time>
            <span aria-hidden="true" className="text-ink-4">·</span>
            <span className="text-ink-4">{duration}</span>
          </p>

          {block.description && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-3">
              {block.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Icon
            className="h-4 w-4"
            style={{ color: block.color, opacity: 0.75 }}
            aria-hidden="true"
          />
          {/* Priority was a bare coloured dot — information carried by hue
              alone, which is unreadable both to a screen reader and to anyone
              who can't separate the red from the green. The dot stays as the
              quick visual cue; the name goes with it. */}
          <span className="flex items-center" title={priority.label}>
            <span className={`h-1.5 w-1.5 rounded-full ${priority.tone}`} aria-hidden="true" />
            <span className="sr-only">{priority.label}</span>
          </span>
          {onPlayMusic && FOCUS_TYPES.has(block.type) && !block.completed && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlayMusic(); }}
              className="flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
              aria-label={`Play study music for ${block.title}`}
              style={{ color: block.color }}
            >
              <Music className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
