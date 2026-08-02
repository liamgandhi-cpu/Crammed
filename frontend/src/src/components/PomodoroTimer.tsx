import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, SkipForward, Minus, Maximize2, X, Music } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Phase = "focus" | "short_break" | "long_break";

const PHASE_DURATION: Record<Phase, number> = {
  focus: 25 * 60,
  short_break: 5 * 60,
  long_break: 15 * 60,
};

const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short_break: "Short Break",
  long_break: "Long Break",
};

const PHASE_COLOR: Record<Phase, string> = {
  focus: "#f97316",
  short_break: "#22c55e",
  long_break: "#38bdf8",
};

const PLAYLISTS = [
  { label: "Lofi Girl",   id: "jfKfPfyJRdk" },
  { label: "Chillhop",    id: "5yx6BWlEVcY" },
  { label: "Night Lofi",  id: "rUxyKA_-grg" },
  { label: "Jazz & Lofi", id: "NEkHJS95ao4" },
];

function playDoneSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(528, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(792, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
  } catch {
    // AudioContext unavailable
  }
}

function sendNotif(title: string, body: string) {
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

const RING_R = 44;
const RING_CIRC = 2 * Math.PI * RING_R;

function ProgressRing({ progress, color, size = 120 }: { progress: number; color: string; size?: number }) {
  const filled = progress * RING_CIRC;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle cx={cx} cy={cx} r={RING_R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${filled} ${RING_CIRC}`} transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: "stroke-dasharray 0.5s linear" }} />
    </svg>
  );
}

interface Props {
  blockId?: string;
  courseName?: string;
  blockTitle?: string;
  onClose: () => void;
}

export default function PomodoroTimer({ blockId, courseName, blockTitle, onClose }: Props) {
  const { token } = useAuth();
  const [phase, setPhase] = useState<Phase>("focus");
  const [timeLeft, setTimeLeft] = useState(PHASE_DURATION.focus);
  const [running, setRunning] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Music state
  const [musicOpen, setMusicOpen] = useState(false);
  const [currentPlaylist, setCurrentPlaylist] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const total = PHASE_DURATION[phase];
  const progress = (total - timeLeft) / total;
  const color = PHASE_COLOR[phase];
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const logSessionStart = useCallback(async () => {
    if (!token || phase !== "focus") return;
    try {
      const { session } = await api.startFocusSession(token, {
        plan_block_id: blockId ?? null,
        course_name: courseName ?? null,
        session_type: "focus",
        duration_seconds: PHASE_DURATION.focus,
      });
      setSessionId(session.id);
    } catch { /* non-blocking */ }
  }, [token, phase, blockId, courseName]);

  const logSessionEnd = useCallback(async (completed: boolean) => {
    if (!token || !sessionId) return;
    try {
      await api.endFocusSession(token, sessionId, { completed });
      setSessionId(null);
    } catch { /* non-blocking */ }
  }, [token, sessionId]);

  const advancePhase = useCallback(() => {
    playDoneSound();
    if (phase === "focus") {
      logSessionEnd(true);
      const newCount = pomodoroCount + 1;
      setPomodoroCount(newCount);
      const nextPhase: Phase = newCount % 4 === 0 ? "long_break" : "short_break";
      setPhase(nextPhase);
      setTimeLeft(PHASE_DURATION[nextPhase]);
      sendNotif("Focus session complete! 🎉", nextPhase === "long_break" ? "Take a 15-minute break." : "Take a 5-minute break.");
    } else {
      setPhase("focus");
      setTimeLeft(PHASE_DURATION.focus);
      sendNotif("Break's over!", "Time to focus again.");
    }
    setRunning(false);
  }, [phase, pomodoroCount, logSessionEnd]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((t) => { if (t <= 1) { advancePhase(); return 0; } return t - 1; });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, advancePhase]);

  useEffect(() => {
    if (running) {
      document.title = `${fmt(timeLeft)} — ${PHASE_LABEL[phase]}`;
    } else {
      document.title = "AutoPlanner";
    }
    return () => { document.title = "AutoPlanner"; };
  }, [running, timeLeft, phase]);

  const handlePlay = () => {
    if (!running) { startTimeRef.current = Date.now(); if (phase === "focus") logSessionStart(); }
    setRunning((r) => !r);
  };
  const handleStop = () => {
    setRunning(false); logSessionEnd(false);
    setPhase("focus"); setTimeLeft(PHASE_DURATION.focus);
    setPomodoroCount(0); setSessionId(null);
  };
  const handleSkip = () => {
    setRunning(false);
    if (phase === "focus") logSessionEnd(false);
    advancePhase();
  };

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-full cursor-pointer shadow-lg"
        style={{ borderColor: color + "44" }} onClick={() => setMinimized(false)}>
        <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: running ? color : "#94a3b8" }} />
        <span className="font-mono text-sm font-bold" style={{ color }}>{fmt(timeLeft)}</span>
        <span className="text-xs text-muted-foreground">{PHASE_LABEL[phase]}</span>
        {musicOpen && <Music className="h-3 w-3 text-primary" />}
        <Maximize2 className="h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-xl w-72 shadow-lg overflow-hidden"
      style={{ borderColor: color + "33" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md flex items-center justify-center" style={{ backgroundColor: color + "22" }}>
            <span className="text-micro">🍅</span>
          </div>
          <span className="text-xs font-semibold">{PHASE_LABEL[phase]}</span>
          <span className="text-micro text-muted-foreground">{Math.floor(pomodoroCount / 4) + 1}.{(pomodoroCount % 4) + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Music toggle */}
          <button
            onClick={() => setMusicOpen((o) => !o)}
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
              musicOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Study music"
          >
            <Music className="h-3 w-3" />
          </button>
          <button onClick={() => setMinimized(true)}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Minus className="h-3 w-3" />
          </button>
          <button onClick={() => { handleStop(); onClose(); }}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Timer ring */}
      <div className="flex flex-col items-center py-5 gap-1">
        <div className="relative">
          <ProgressRing progress={progress} color={color} size={120} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-3xl font-bold leading-none" style={{ color }}>{fmt(timeLeft)}</span>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-full transition-all" style={{
              backgroundColor: i < pomodoroCount % 4 ? color : i === pomodoroCount % 4 && running ? color + "80" : "rgba(255,255,255,0.12)",
            }} />
          ))}
        </div>
        {(blockTitle ?? courseName) && (
          <p className="text-micro text-muted-foreground mt-1 max-w-[200px] truncate text-center">
            {phase === "focus" ? "Studying: " : "Break from: "}
            <span className="text-foreground">{blockTitle ?? courseName}</span>
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 pb-4">
        <button onClick={handleStop}
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <Square className="h-4 w-4" />
        </button>
        <button onClick={handlePlay}
          className="h-11 w-11 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{ backgroundColor: color, color: "#fff" }}>
          {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        <button onClick={handleSkip}
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {/* Music panel */}
      {musicOpen && (
        <div className="border-t border-border">
          {/* Playlist tabs */}
          <div className="flex gap-1 px-3 py-2 overflow-x-auto">
            {PLAYLISTS.map((p, i) => (
              <button key={p.id} onClick={() => setCurrentPlaylist(i)}
                className={`text-micro font-medium px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                  currentPlaylist === i ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          {/* YouTube embed */}
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              key={PLAYLISTS[currentPlaylist].id}
              src={`https://www.youtube.com/embed/${PLAYLISTS[currentPlaylist].id}?rel=0`}
              title={PLAYLISTS[currentPlaylist].label}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
