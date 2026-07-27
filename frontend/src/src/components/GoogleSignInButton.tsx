import { useGoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface Props {
  onError?: (msg: string) => void;
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function GoogleSignInButton({ onError }: Props) {
  const { googleAuth } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        await googleAuth(tokenResponse.access_token);
        navigate("/dashboard");
      } catch (err) {
        onError?.(err instanceof ApiError ? err.message : "Google sign-in failed.");
      } finally {
        setLoading(false);
      }
    },
    onError: () => onError?.("Google sign-in was cancelled or failed."),
  });

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 rounded-lg border border-border bg-card hover:bg-muted/50 px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </button>
  );
}
