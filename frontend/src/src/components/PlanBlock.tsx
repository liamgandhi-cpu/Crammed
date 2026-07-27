import { CheckCircle2, Circle, Music } from "lucide-react";
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

const TYPE_ICON: Record<string, string> = {
  class: "📚",
  study: "🧠",
  assignment: "✏️",
  break: "☕",
  prep: "📋",
  exam: "📝",
  free: "🎯",
  meal: "🍽️",
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

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-all duration-300 group ${
        isCurrent ? "shadow-lg ring-1" : "hover:shadow-md"
      } ${dim ? "opacity-50" : ""}`}
      style={{
        backgroundColor: `${block.color}10`,
        borderColor: isCurrent ? `${block.color}60` : `${block.color}25`,
        boxShadow: isCurrent ? `0 0 0 1px ${block.color}40, 0 8px 24px ${block.color}15` : undefined,
      }}
    >
      {/* 4px left accent border */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ backgroundColor: block.color }}
      />

      <div className="pl-4 pr-3 py-3 flex gap-3 items-start">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(block.id, !block.completed)}
          className="flex-shrink-0 mt-0.5 transition-transform active:scale-90"
          style={{ color: block.completed ? block.color : undefined }}
        >
          {block.completed ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-semibold leading-snug transition-all ${
                block.completed ? "line-through text-muted-foreground" : ""
              }`}
              style={{ color: block.completed ? undefined : block.color }}
            >
              {block.title}
            </span>
            {isCurrent && (
              <span
                className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full border animate-pulse"
                style={{
                  color: block.color,
                  borderColor: `${block.color}60`,
                  backgroundColor: `${block.color}15`,
                }}
              >
                NOW
              </span>
            )}
          </div>

          {/* Time + duration */}
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-mono">
            {formatTime(block.startTime)} – {formatTime(block.endTime)}
            <span className="ml-2 font-sans not-italic text-muted-foreground/50">
              {mins >= 60
                ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ""}`
                : `${mins}m`}
            </span>
          </p>

          {/* Description */}
          {block.description && (
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed line-clamp-2">
              {block.description}
            </p>
          )}
        </div>

        {/* Right: type emoji + priority + music */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-base leading-none">{TYPE_ICON[block.type] ?? "📌"}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${
            block.priority === "high" ? "bg-red-500" :
            block.priority === "medium" ? "bg-yellow-400" : "bg-green-500"
          }`} />
          {onPlayMusic && FOCUS_TYPES.has(block.type) && !block.completed && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlayMusic(); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded-md hover:bg-white/10"
              title="Play study music"
              style={{ color: block.color }}
            >
              <Music className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
