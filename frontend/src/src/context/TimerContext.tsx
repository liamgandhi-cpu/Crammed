import { createContext, useContext, useState, type ReactNode } from "react";

interface TimerStart {
  blockId?: string;
  courseName?: string;
  blockTitle?: string;
}

interface TimerContextType {
  timerConfig: TimerStart | null;
  startTimer: (cfg: TimerStart) => void;
  stopTimer: () => void;
}

const TimerContext = createContext<TimerContextType>({
  timerConfig: null,
  startTimer: () => {},
  stopTimer: () => {},
});

export function TimerProvider({ children }: { children: ReactNode }) {
  const [timerConfig, setTimerConfig] = useState<TimerStart | null>(null);

  return (
    <TimerContext.Provider value={{
      timerConfig,
      startTimer: setTimerConfig,
      stopTimer: () => setTimerConfig(null),
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  return useContext(TimerContext);
}
