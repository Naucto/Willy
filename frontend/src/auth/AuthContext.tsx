import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, unwrap } from "../api/client";
import { tokens } from "../api/tokens";
import type { AuthUser } from "../api/types";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate an existing token on boot so a reload keeps the session.
  useEffect(() => {
    if (!tokens.getAccess()) {
      setLoading(false);

      return;
    }

    api
      .GET("/auth/me")
      .then((result) => setUser(result.data ?? null))
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = unwrap(await api.POST("/auth/login", { body: { email, password } }));
    tokens.set(session.accessToken, session.refreshToken);
    setUser({ userId: session.user.id, email: session.user.email, role: session.user.role });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.POST("/auth/logout");
    } finally {
      tokens.clear();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = use(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
