import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, type AuthResponse } from "@/lib/api";

interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, confirmPassword: string) => Promise<void>;
  googleAuth: (accessToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "autoplanner_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [loading, setLoading] = useState(true);

  // Hydrate user from stored token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .me(token)
      .then(({ user }) => setUser(user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuth = useCallback((res: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      handleAuth(res);
    },
    [handleAuth]
  );

  const signup = useCallback(
    async (email: string, password: string, confirmPassword: string) => {
      const res = await api.signup(email, password, confirmPassword);
      handleAuth(res);
    },
    [handleAuth]
  );

  const googleAuth = useCallback(
    async (accessToken: string) => {
      const res = await api.googleAuth(accessToken);
      handleAuth(res);
    },
    [handleAuth]
  );

  const logout = useCallback(() => {
    if (token) api.logout(token).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, googleAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
