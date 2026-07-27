import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TimerProvider, useTimer } from "@/context/TimerContext";
import { ScrapeJobProvider } from "@/context/ScrapeJobContext";
import PomodoroTimer from "@/components/PomodoroTimer";
import ScrapeJobBanner from "@/components/ScrapeJobBanner";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DashboardPage from "@/pages/DashboardPage";
import TodayPage from "@/pages/TodayPage";
import OnboardingModal, { isOnboarded, markOnboarded } from "@/components/OnboardingModal";
import { api } from "@/lib/api";

function GlobalTimer() {
  const { timerConfig, stopTimer } = useTimer();
  if (!timerConfig) return null;
  return (
    <PomodoroTimer
      blockId={timerConfig.blockId}
      courseName={timerConfig.courseName}
      blockTitle={timerConfig.blockTitle}
      onClose={stopTimer}
    />
  );
}

export function App() {
  const { user, loading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!loading && user && !isOnboarded(user.id)) {
      setShowOnboarding(true);
    }
  }, [user, loading]);

  const handleOnboardingComplete = () => {
    if (user) markOnboarded(user.id);
    setShowOnboarding(false);
  };

  // Background Schoology auto-sync: trigger if last sync > 6 hours ago
  useEffect(() => {
    if (!user || loading) return;
    const token = localStorage.getItem("autoplanner_token");
    if (!token) return;

    api.getIntegrations(token).then(({ accounts }) => {
      const schoology = accounts.find((a) => a.provider === "schoology");
      if (schoology) {
        const lastSynced = schoology.last_synced_at ? new Date(schoology.last_synced_at).getTime() : 0;
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        if (lastSynced < sixHoursAgo) {
          api.syncSchoology(token).catch(() => {});
        }
      }

      // Ion: sync daily (every 24 hours) to keep class schedules current
      const ion = accounts.find((a) => a.provider === "ion");
      if (ion) {
        const lastSynced = ion.last_synced_at ? new Date(ion.last_synced_at).getTime() : 0;
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (lastSynced < oneDayAgo) {
          api.syncIon(token).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [user, loading]);

  return (
    <ScrapeJobProvider>
      <TimerProvider>
        {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}
        <Routes>
          <Route
            path="/"
            element={user && !loading ? <Navigate to="/today" replace /> : <LandingPage />}
          />
          <Route
            path="/login"
            element={user && !loading ? <Navigate to="/today" replace /> : <LoginPage />}
          />
          <Route
            path="/signup"
            element={user && !loading ? <Navigate to="/today" replace /> : <SignupPage />}
          />
          <Route
            path="/today"
            element={
              <ProtectedRoute>
                <TodayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <GlobalTimer />
        <ScrapeJobBanner />
      </TimerProvider>
    </ScrapeJobProvider>
  );
}
