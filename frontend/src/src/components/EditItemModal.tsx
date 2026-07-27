import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ScheduleItem, type NewScheduleItem } from "@/lib/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const PALETTE = [
  "#f97316", "#38bdf8", "#a855f7", "#22c55e",
  "#f43f5e", "#eab308", "#06b6d4", "#ec4899",
  "#8b5cf6", "#10b981", "#ef4444", "#3b82f6",
];

interface Props {
  item: ScheduleItem;
  onClose: () => void;
  onSave: (id: string, updates: NewScheduleItem) => Promise<void>;
}

export default function EditItemModal({ item, onClose, onSave }: Props) {
  const [title, setTitle] = useState(item.title);
  const [day, setDay] = useState(String(item.day_of_week));
  const [startTime, setStartTime] = useState(item.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(item.end_time?.slice(0, 5) ?? "");
  const [color, setColor] = useState(item.color);
  const [location, setLocation] = useState(item.location ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    item.estimated_minutes ? String(item.estimated_minutes) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(item.id, {
        title: title.trim(),
        category: item.category,
        day_of_week: parseInt(day, 10),
        start_time: startTime,
        end_time: endTime,
        color,
        location: location.trim() || null,
        notes: notes.trim() || null,
        source: item.source,
        source_id: item.source_id,
        source_file: item.source_file,
        due_date: item.due_date,
        estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
      });
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 bg-card border border-border rounded-xl w-full max-w-md flex flex-col animate-fade-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-base font-bold">Edit Class</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Class name"
            />
          </div>

          {/* Day */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-day">Day</Label>
            <select
              id="edit-day"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DAYS.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start time</Label>
              <Input
                id="edit-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">End time</Label>
              <Input
                id="edit-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "white" : "transparent",
                    outline: color === c ? `2px solid ${c}` : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-location">Location <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room number or building"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Teacher name, extra info…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Exam importance → sets total study minutes, AI spreads them across days */}
          {item.category === "exam" && (
            <div className="space-y-2">
              <Label>
                How important is this exam?{" "}
                <span className="text-muted-foreground">(sets study time)</span>
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Low",      mins: 60,  color: "bg-green-500/15 text-green-400 border-green-500/30" },
                  { label: "Medium",   mins: 120, color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
                  { label: "High",     mins: 240, color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
                  { label: "Critical", mins: 360, color: "bg-red-500/15 text-red-400 border-red-500/30" },
                ].map(({ label, mins, color }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setEstimatedMinutes(String(mins))}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all ${
                      estimatedMinutes === String(mins)
                        ? color + " ring-2 ring-offset-1 ring-offset-background"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {label}
                    <span className="block text-[10px] font-normal opacity-75 mt-0.5">
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-estimated"
                  type="number"
                  min={1}
                  max={1440}
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  placeholder="or enter minutes manually"
                  className="flex-1 text-sm"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">min total</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The AI will spread this study time across the days leading up to the exam.
              </p>
            </div>
          )}

          {/* Assignment / project — how long it will take */}
          {["assignment", "project"].includes(item.category) && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-estimated">
                Time to complete <span className="text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-estimated"
                  type="number"
                  min={1}
                  max={1440}
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  placeholder="e.g. 45"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">min</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The AI will schedule a block of exactly this length on the right day.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-border">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
