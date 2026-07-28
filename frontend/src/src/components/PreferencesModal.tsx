import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Settings, GraduationCap, Clock, Brain, MapPin, Bell, Smartphone } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type UserPreferences, type NotificationPreferences } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFocusRestore } from "@/hooks/useFocusRestore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULTS: UserPreferences = {
  wake_time: "07:00",
  sleep_time: "23:00",
  study_style: "balanced",
  break_frequency: 90,
  break_duration: 15,
  max_study_hours: 6,
  notes: null,
  commute_minutes: 0,
  preferred_block_length: 60,
  hard_subjects: null,
  semester_load: "moderate",
};

const STUDY_STYLES = [
  { value: "balanced",   label: "Balanced",    desc: "Even spread throughout the day" },
  { value: "early_bird", label: "Early Bird",  desc: "Hard tasks front-loaded before noon" },
  { value: "night_owl",  label: "Night Owl",   desc: "Hard tasks in the afternoon/evening" },
  { value: "pomodoro",   label: "Pomodoro",    desc: "25-min work / 5-min break cycles" },
] as const;

const BLOCK_LENGTHS = [25, 30, 45, 60, 90, 120] as const;

const SEMESTER_LOADS = [
  { value: "light",    label: "Light",    desc: "Easy semester, lots of free time" },
  { value: "moderate", label: "Moderate", desc: "Typical semester workload" },
  { value: "heavy",    label: "Heavy",    desc: "Packed schedule, lots of assignments" },
] as const;

function normalizeTime(t: string): string {
  return String(t ?? "").slice(0, 5);
}

const NOTIF_DEFAULTS: NotificationPreferences = {
  enabled: true,
  assignment_reminders: true,
  daily_plan_ready: true,
  study_reminders: true,
  exam_warnings: true,
  weekly_summary_email: false,
  reminder_minutes_before: 15,
};

export default function PreferencesModal({ isOpen, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const { state: pushState, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications(token);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(NOTIF_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleCloseAutoFocus = useFocusRestore(isOpen);

  useEffect(() => {
    if (!isOpen || !token) return;
    api.getPreferences(token).then(({ preferences }) => {
      setPrefs({
        ...DEFAULTS,
        ...preferences,
        // Normalize HH:MM:SS → HH:MM (fix DB TIME column format)
        wake_time: normalizeTime(preferences.wake_time),
        sleep_time: normalizeTime(preferences.sleep_time),
      });
    }).catch(() => {});
    api.getNotificationPreferences(token).then((p) => setNotifPrefs({ ...NOTIF_DEFAULTS, ...p })).catch(() => {});
  }, [isOpen, token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        api.updatePreferences(token, prefs),
        api.updateNotificationPreferences(token, notifPrefs),
      ]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[3px]" />

        <div className="dialog-stage fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            onCloseAutoFocus={handleCloseAutoFocus}
            aria-describedby={undefined}
            className="dialog-surface pointer-events-auto bg-card border border-border rounded-xl w-full max-w-lg flex flex-col animate-dialog-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Settings className="h-4 w-4 text-primary" />
                </div>
                <Dialog.Title className="font-display text-base font-bold">Planner Preferences</Dialog.Title>
              </div>
              <Dialog.Close aria-label="Close" className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {/* Body */}
            <div className="p-5 space-y-6 overflow-y-auto max-h-[72vh]">

              {/* ── Schedule ──────────────────────────────────── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Schedule</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="wake">Wake time</Label>
                    <Input id="wake" type="time" value={prefs.wake_time}
                      onChange={(e) => setPrefs((p) => ({ ...p, wake_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sleep">Sleep time</Label>
                    <Input id="sleep" type="time" value={prefs.sleep_time}
                      onChange={(e) => setPrefs((p) => ({ ...p, sleep_time: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="commute">Commute to campus (minutes each way)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="commute"
                      type="range" min={0} max={90} step={5}
                      value={prefs.commute_minutes}
                      onChange={(e) => setPrefs((p) => ({ ...p, commute_minutes: parseInt(e.target.value) }))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-bold text-primary w-12 text-right">
                      {prefs.commute_minutes === 0 ? "None" : `${prefs.commute_minutes}m`}
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Semester ──────────────────────────────────── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Semester</span>
                </div>

                <div className="space-y-2">
                  <Label id="prefs-semester-label">How heavy is your semester right now?</Label>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="prefs-semester-label">
                    {SEMESTER_LOADS.map((s) => (
                      <button
                        key={s.value}
                        aria-pressed={prefs.semester_load === s.value}
                        onClick={() => setPrefs((p) => ({ ...p, semester_load: s.value }))}
                        className={`text-left p-3 rounded-xl border text-sm transition-all ${
                          prefs.semester_load === s.value
                            ? "border-primary/60 bg-primary/10"
                            : "border-border bg-muted/20 hover:border-border/80"
                        }`}
                      >
                        <div className="font-medium text-sm">{s.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="hardsubjects">
                    Which subjects are hardest for you?
                    <span className="ml-1 text-muted-foreground font-normal">(AI gives them more time)</span>
                  </Label>
                  <Input
                    id="hardsubjects"
                    placeholder="e.g. Calculus, Organic Chemistry"
                    value={prefs.hard_subjects ?? ""}
                    onChange={(e) => setPrefs((p) => ({ ...p, hard_subjects: e.target.value || null }))}
                  />
                </div>
              </section>

              {/* ── Study style ───────────────────────────────── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Study Style</span>
                </div>

                <div className="space-y-2">
                  <Label id="prefs-style-label">When do you work best?</Label>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="prefs-style-label">
                    {STUDY_STYLES.map((s) => (
                      <button
                        key={s.value}
                        aria-pressed={prefs.study_style === s.value}
                        onClick={() => setPrefs((p) => ({ ...p, study_style: s.value }))}
                        className={`text-left p-3 rounded-xl border text-sm transition-all ${
                          prefs.study_style === s.value
                            ? "border-primary/60 bg-primary/10"
                            : "border-border bg-muted/20 hover:border-border/80"
                        }`}
                      >
                        <div className="font-medium text-sm">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label id="prefs-block-label">Preferred study block length</Label>
                    <span className="text-sm font-bold text-primary">{prefs.preferred_block_length}m</span>
                  </div>
                  <div className="flex gap-2 flex-wrap" role="group" aria-labelledby="prefs-block-label">
                    {BLOCK_LENGTHS.map((l) => (
                      <button
                        key={l}
                        aria-pressed={prefs.preferred_block_length === l}
                        onClick={() => setPrefs((p) => ({ ...p, preferred_block_length: l }))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          prefs.preferred_block_length === l
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                        }`}
                      >
                        {l === 120 ? "2h" : `${l}m`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bfreq">Break every (min)</Label>
                    <Input id="bfreq" type="number" min={15} max={180}
                      value={prefs.break_frequency}
                      onChange={(e) => setPrefs((p) => ({ ...p, break_frequency: parseInt(e.target.value) || 90 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bdur">Break length (min)</Label>
                    <Input id="bdur" type="number" min={5} max={60}
                      value={prefs.break_duration}
                      onChange={(e) => setPrefs((p) => ({ ...p, break_duration: parseInt(e.target.value) || 15 }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="maxhours">Max study hours / day</Label>
                    <span className="text-sm font-bold text-primary">{prefs.max_study_hours}h</span>
                  </div>
                  <input
                    id="maxhours"
                    type="range" min={1} max={12} step={1}
                    value={prefs.max_study_hours}
                    onChange={(e) => setPrefs((p) => ({ ...p, max_study_hours: parseInt(e.target.value) }))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1h</span><span>6h</span><span>12h</span>
                  </div>
                </div>
              </section>

              {/* ── Notifications ─────────────────────────────── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notifications</span>
                </div>

                {/* Push notification toggle */}
                {pushState !== "unsupported" && (
                  <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-start gap-2.5">
                      <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Push notifications</div>
                        <div className="text-[11px] text-muted-foreground">
                          {pushState === "denied"
                            ? "Blocked — enable in your browser/phone settings"
                            : pushState === "subscribed"
                            ? "You'll get reminders even when the app is closed"
                            : "Get reminders even when the app is closed"}
                        </div>
                      </div>
                    </div>
                    {pushState !== "denied" && (
                      <button
                        type="button"
                        disabled={pushState === "loading"}
                        onClick={() => pushState === "subscribed" ? pushUnsubscribe() : pushSubscribe()}
                        className={`flex-shrink-0 mt-0.5 h-5 w-9 rounded-full border transition-colors disabled:opacity-50 ${
                          pushState === "subscribed"
                            ? "bg-primary border-primary"
                            : "bg-muted/40 border-border"
                        }`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-px ${pushState === "subscribed" ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {[
                    { key: "assignment_reminders" as const, label: "Assignment reminders", desc: "Notified at 8 AM for items due today" },
                    { key: "exam_warnings" as const,        label: "Exam warnings",        desc: "Alert 3 days and 1 day before exams" },
                    { key: "study_reminders" as const,      label: "Study block reminders", desc: "Before upcoming study blocks on your plan" },
                    { key: "weekly_summary_email" as const, label: "Weekly summary email",  desc: "Email digest of your week every Monday" },
                  ].map(({ key, label, desc }) => (
                    <label key={key} className="flex items-start justify-between gap-3 cursor-pointer group">
                      <div>
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-[11px] text-muted-foreground">{desc}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs[key]}
                        onClick={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                        className={`flex-shrink-0 mt-0.5 h-5 w-9 rounded-full border transition-colors ${
                          notifPrefs[key]
                            ? "bg-primary border-primary"
                            : "bg-muted/40 border-border"
                        }`}
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-px ${
                            notifPrefs[key] ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </label>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reminder-mins">Remind me before study blocks</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="reminder-mins"
                      type="range" min={5} max={60} step={5}
                      value={notifPrefs.reminder_minutes_before}
                      onChange={(e) => setNotifPrefs((p) => ({ ...p, reminder_minutes_before: parseInt(e.target.value) }))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-bold text-primary w-12 text-right">
                      {notifPrefs.reminder_minutes_before}m
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Anything else ──────────────────────────────── */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anything else?</span>
                </div>
                <textarea
                  value={prefs.notes ?? ""}
                  onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value || null }))}
                  placeholder="e.g. I have a part-time job Tuesday evenings 6–9 PM. I need 30 min after waking before I can focus. I hate studying after 10 PM."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
                />
              </section>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-5 border-t border-border">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save & Regenerate"}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
