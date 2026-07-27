import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  AlertCircle,
  GraduationCap,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useScrapeJob } from "@/context/ScrapeJobContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Tab = "studentvue" | "schoology" | "ion";

// ── StudentVUE district list ────────────────────────────────

const STUDENTVUE_DISTRICTS = [
  { label: "Fairfax County Public Schools (FCPS)",         url: "https://sisstudent.fcps.edu/SVUE" },
  { label: "Loudoun County Public Schools (LCPS)",          url: "https://sis.lcps.org" },
  { label: "Prince William County Schools (PWCS)",          url: "https://va-pwcps-psv.edupoint.com" },
  { label: "Arlington Public Schools (APS)",                url: "https://va-arl-psv.edupoint.com" },
  { label: "Montgomery County Public Schools (MCPS)",       url: "https://md-mcps.edupoint.com" },
  { label: "Stafford County Public Schools (SPS)",          url: "https://psp.staffordschools.net" },
  { label: "Spotsylvania County Public Schools (SPCS)",     url: "https://synergy.spotsylvania.k12.va.us" },
  { label: "Williamsburg-James City County Schools (WJCC)", url: "https://va-wjccp-psv.edupoint.com" },
];

// ── StudentVUE tab ─────────────────────────────────────────
// Fully automated: fills login form in a visible Chrome window.

function StudentVueTab({ onImported, onClose }: { onImported: () => void; onClose: () => void }) {
  const { token } = useAuth();
  const { startJob } = useScrapeJob();
  const [districtUrl, setDistrictUrl] = useState(STUDENTVUE_DISTRICTS[0].url);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(() => {
    if (!token) return;
    setError(null);
    const promise = api.connectStudentVue(token, districtUrl, username, password);
    startJob("studentvue", promise, onImported);
    onClose();
  }, [token, districtUrl, username, password, startJob, onImported, onClose]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
        <span>
          Logs in to StudentVUE automatically in the background. Your credentials are
          encrypted before storage and never logged.
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sv-district">School District</Label>
        <select
          id="sv-district"
          value={districtUrl}
          onChange={(e) => setDistrictUrl(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {STUDENTVUE_DISTRICTS.map((d) => (
            <option key={d.url} value={d.url}>{d.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sv-user">Student ID</Label>
        <Input
          id="sv-user"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. 1960584"
          autoComplete="username"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sv-pass">
          Password <Shield className="inline h-3 w-3 text-muted-foreground ml-1" />
        </Label>
        <div className="relative">
          <Input
            id="sv-pass"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your StudentVUE password"
            autoComplete="current-password"
            className="pr-10"
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

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button
        onClick={handleConnect}
        disabled={!districtUrl || !username || !password}
        className="w-full"
      >
        <GraduationCap className="h-4 w-4 mr-2" />
        Import from StudentVUE
      </Button>
    </div>
  );
}

// ── Schoology district list ─────────────────────────────────

const SCHOOLOGY_DISTRICTS = [
  { label: "Fairfax County Public Schools (FCPS)", host: "lms.fcps.edu",    sso: "fcps" },
  { label: "Loudoun County Public Schools (LCPS)",  host: "learn.lcps.org", sso: "classlink" },
];

// ── Schoology tab ──────────────────────────────────────────
// Fully automated: Puppeteer logs in via district SSO in the background.

function SchoologyTab({ onImported, onClose }: { onImported: () => void; onClose: () => void }) {
  const { token } = useAuth();
  const { startJob } = useScrapeJob();
  const [district, setDistrict] = useState(SCHOOLOGY_DISTRICTS[0]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleConnect = useCallback(() => {
    if (!token) return;
    const promise = api.connectSchoology(token, district.host, username, password);
    startJob("schoology", promise, onImported);
    onClose();
  }, [token, district, username, password, startJob, onImported, onClose]);

  const userPlaceholder = district.sso === "classlink" ? "student@lcps.org" : "e.g. 1960584";
  const passPlaceholder = district.sso === "classlink" ? "Your LCPS password" : "Your FCPS network password";

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
        <span>
          Logs in automatically using your district credentials. Your credentials are
          encrypted before storage and never logged.
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sc-district">School District</Label>
        <select
          id="sc-district"
          value={district.host}
          onChange={(e) => setDistrict(SCHOOLOGY_DISTRICTS.find(d => d.host === e.target.value)!)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {SCHOOLOGY_DISTRICTS.map((d) => (
            <option key={d.host} value={d.host}>{d.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sc-user">Username</Label>
        <Input
          id="sc-user"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={userPlaceholder}
          autoComplete="username"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sc-pass">
          Password <Shield className="inline h-3 w-3 text-muted-foreground ml-1" />
        </Label>
        <div className="relative">
          <Input
            id="sc-pass"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passPlaceholder}
            autoComplete="current-password"
            className="pr-10"
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

      <Button
        onClick={handleConnect}
        disabled={!district || !username || !password}
        className="w-full"
      >
        <BookOpen className="h-4 w-4 mr-2" />
        Import from Schoology
      </Button>
    </div>
  );
}

// ── Ion tab ────────────────────────────────────────────────
// OAuth redirect flow: opens Ion's authorisation page in a new tab.

function IonTab({ onImported }: { onImported: () => void }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Check if returning from Ion OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ion") === "connected") {
      setConnected(true);
      onImported();
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [onImported]);

  const handleConnect = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { url } = await api.getIonAuthUrl(token);
      // Redirect current tab so Ion can redirect back with the code
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reach Ion. Try again."
      );
      setLoading(false);
    }
  }, [token]);

  if (connected) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center animate-fade-slide-up">
        <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Ion Connected!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your TJ Ion account is linked. Your daily schedule will sync automatically every morning.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
        <span>
          Connects to Ion using OAuth — your TJHSST credentials are never stored.
          You'll be redirected to Ion to authorise access, then brought back here.
        </span>
      </div>

      <div className="rounded-xl bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">What gets imported?</p>
        <p>Your class periods for each school day this week are added to AutoPlanner, including course names and room numbers.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button onClick={handleConnect} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Redirecting to Ion…
          </>
        ) : (
          <>
            <ExternalLink className="h-4 w-4 mr-2" />
            Connect Ion (TJHSST)
          </>
        )}
      </Button>
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────────

export default function ConnectAccountModal({ isOpen, onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>("studentvue");

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-fade-in" />

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content className="pointer-events-auto bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col animate-fade-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <Dialog.Title className="font-display text-lg font-bold">Connect School Account</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                  Auto-import your schedule and assignments via Chrome
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4">
              <div className="flex gap-1 bg-muted/30 rounded-xl p-1">
                {(["studentvue", "schoology", "ion"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      tab === t
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "studentvue" ? "StudentVUE" : t === "schoology" ? "Schoology" : "Ion"}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {tab === "studentvue" ? (
                <StudentVueTab onImported={onImported} onClose={onClose} />
              ) : tab === "schoology" ? (
                <SchoologyTab onImported={onImported} onClose={onClose} />
              ) : (
                <IonTab onImported={onImported} />
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
