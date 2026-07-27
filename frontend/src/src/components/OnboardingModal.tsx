import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  CalendarRange, GraduationCap, Clock, Brain,
  CheckCircle2, ChevronRight, Loader2, Shield,
  Eye, EyeOff, AlertCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, type UserPreferences } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ── localStorage key ────────────────────────────────────────

export function isOnboarded(userId: string): boolean {
  return localStorage.getItem(`autoplanner_onboarded_${userId}`) === "1";
}

export function markOnboarded(userId: string): void {
  localStorage.setItem(`autoplanner_onboarded_${userId}`, "1");
}

// ── Types ───────────────────────────────────────────────────

type Step = "welcome" | "connect" | "prefs" | "done";

interface Props {
  onComplete: () => void;
}

// ── Step 1: Welcome ─────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center animate-fade-slide-up">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <CalendarRange className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold">Welcome to AutoPlanner</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your AI-powered study planner that syncs with StudentVUE and Schoology.
          Let's get you set up in under a minute.
        </p>
      </div>

      <div className="w-full space-y-2.5 text-left">
        {[
          { icon: GraduationCap, label: "Import your schedule from StudentVUE" },
          { icon: Brain,         label: "AI generates your daily study plan" },
          { icon: Clock,         label: "Reminders so you never miss a due date" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-muted/20 px-4 py-2.5">
            <Icon className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm">{label}</span>
          </div>
        ))}
      </div>

      <Button onClick={onNext} className="w-full mt-2" size="lg">
        Get started <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

// ── Step 2: Connect StudentVUE ──────────────────────────────

function ConnectStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { token } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ classCount: number; assignmentCount: number } | null>(null);

  const handleConnect = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.connectStudentVue(token, "https://sisstudent.fcps.edu/SVUE/", username, password);
      setResult({ classCount: res.classCount, assignmentCount: res.assignmentCount });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Check your Student ID and password."
      );
    } finally {
      setLoading(false);
    }
  }, [token, username, password]);

  if (result) {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center animate-fade-slide-up">
        <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Schedule Imported!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="text-foreground font-medium">{result.classCount} class{result.classCount !== 1 ? "es" : ""}</span>
            {" "}and{" "}
            <span className="text-foreground font-medium">{result.assignmentCount} assignment{result.assignmentCount !== 1 ? "s" : ""}</span>
            {" "}added to your schedule.
          </p>
        </div>
        <Button onClick={onNext} className="w-full" size="lg">
          Next: Set preferences <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center animate-fade-slide-up">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-base font-bold">Importing from StudentVUE…</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Opening Chrome and logging in for you. This takes about 20–40 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Scraping schedule and assignments…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-slide-up">
      <div className="text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold">Connect StudentVUE</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Auto-import your classes and assignments. You can also do this later.
        </p>
      </div>

      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
        <span>Your credentials are encrypted before storage and never logged.</span>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ob-sv-user">Student ID</Label>
          <Input
            id="ob-sv-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. 1960584"
            autoComplete="username"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-sv-pass">Password</Label>
          <div className="relative">
            <Input
              id="ob-sv-pass"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your StudentVUE password"
              autoComplete="current-password"
              className="pr-10"
              onKeyDown={(e) => { if (e.key === "Enter" && username && password) handleConnect(); }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          Skip for now
        </Button>
        <Button onClick={handleConnect} disabled={!username || !password} className="flex-1">
          <GraduationCap className="h-4 w-4 mr-1.5" />
          Import
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Preferences ─────────────────────────────────────

const STUDY_STYLES = [
  { value: "balanced",   label: "Balanced",    desc: "Even spread throughout the day" },
  { value: "early_bird", label: "Early Bird",  desc: "Hard tasks front-loaded in the morning" },
  { value: "night_owl",  label: "Night Owl",   desc: "Hard tasks in the afternoon/evening" },
  { value: "pomodoro",   label: "Pomodoro",    desc: "25-min work / 5-min break cycles" },
] as const;

function PrefsStep({ onNext }: { onNext: () => void }) {
  const { token } = useAuth();
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [studyStyle, setStudyStyle] = useState<UserPreferences["study_style"]>("balanced");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.updatePreferences(token, {
        wake_time: wakeTime,
        sleep_time: sleepTime,
        study_style: studyStyle,
      } as Partial<UserPreferences>);
      onNext();
    } catch {
      setError("Failed to save preferences. You can change them later in Settings.");
      // Don't block onboarding on a prefs save error
      setTimeout(onNext, 2000);
    } finally {
      setSaving(false);
    }
  }, [token, wakeTime, sleepTime, studyStyle, onNext]);

  return (
    <div className="flex flex-col gap-5 animate-fade-slide-up">
      <div className="text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
          <Brain className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold">Your Study Style</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Tell AutoPlanner how you like to work so it can plan your day.
        </p>
      </div>

      {/* Wake / sleep times */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ob-wake" className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Wake time
          </Label>
          <Input
            id="ob-wake"
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-sleep" className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Sleep time
          </Label>
          <Input
            id="ob-sleep"
            type="time"
            value={sleepTime}
            onChange={(e) => setSleepTime(e.target.value)}
          />
        </div>
      </div>

      {/* Study style */}
      <div className="space-y-2">
        <Label>Study style</Label>
        <div className="grid grid-cols-2 gap-2">
          {STUDY_STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStudyStyle(s.value)}
              className={`text-left rounded-xl border p-3 transition-all ${
                studyStyle === s.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/20 hover:bg-muted/40"
              }`}
            >
              <div className="font-medium text-sm">{s.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save &amp; finish
      </Button>
    </div>
  );
}

// ── Step 4: Done ────────────────────────────────────────────

function DoneStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center animate-fade-slide-up">
      <div className="h-20 w-20 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
        <Sparkles className="h-10 w-10 text-green-400" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold">You're all set!</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          AutoPlanner will generate your daily study plan each morning.
          You can connect more accounts and tweak settings anytime.
        </p>
      </div>

      <div className="w-full space-y-2 text-left text-sm text-muted-foreground">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">What's next</p>
        {[
          "Check Today's plan — your first AI plan is ready",
          "Visit Dashboard to see your full schedule",
          "Open Settings to connect Schoology or adjust reminders",
        ].map((tip) => (
          <div key={tip} className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>{tip}</span>
          </div>
        ))}
      </div>

      <Button onClick={onComplete} className="w-full" size="lg">
        Go to my plan
      </Button>
    </div>
  );
}

// ── Progress dots ───────────────────────────────────────────

const STEPS: Step[] = ["welcome", "connect", "prefs", "done"];

function ProgressDots({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`rounded-full transition-all duration-300 ${
            i === idx
              ? "w-5 h-1.5 bg-primary"
              : i < idx
              ? "w-1.5 h-1.5 bg-primary/40"
              : "w-1.5 h-1.5 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

// ── Modal shell ─────────────────────────────────────────────

export default function OnboardingModal({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");

  const next = useCallback((to?: Step) => {
    setStep((s) => to ?? (STEPS[STEPS.indexOf(s) + 1] as Step));
  }, []);

  return (
    // Intentionally non-dismissible: onboarding must be completed, not escaped.
    // `open` is constant and there is no onOpenChange, so the only exit is
    // onComplete. Escape and outside-click are explicitly blocked to preserve
    // the pre-migration behaviour, which had no close path at all.
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[3px] animate-fade-in" />

        <div className="dialog-stage fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="dialog-surface pointer-events-auto bg-card border border-border rounded-xl w-full max-w-md flex flex-col gap-6 p-8 animate-dialog-in"
          >
            {/* No single visible title — each step has its own heading. */}
            <VisuallyHidden.Root asChild>
              <Dialog.Title>Getting started</Dialog.Title>
            </VisuallyHidden.Root>

            <ProgressDots current={step} />

            {step === "welcome" && <WelcomeStep onNext={() => next()} />}
            {step === "connect" && (
              <ConnectStep
                onNext={() => next()}
                onSkip={() => next()}
              />
            )}
            {step === "prefs" && <PrefsStep onNext={() => next()} />}
            {step === "done"  && <DoneStep onComplete={onComplete} />}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
