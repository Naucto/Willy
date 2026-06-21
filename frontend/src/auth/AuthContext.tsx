import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AUTH_EXPIRED_EVENT, api, unwrap } from "../api/client";
import { tokens } from "../api/tokens";
import type { AuthUser, Session, TotpSetupResponse } from "../api/types";
import { ContextUsageError } from "../errors";

// Outcome of the first login step: either we're in, or a second 2FA step is needed.
export type LoginOutcome =
  | { status: "authenticated" }
  | { status: "totp_required"; challengeToken: string }
  | { status: "totp_setup_required"; challengeToken: string };

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeTotpLogin: (challengeToken: string, code: string) => Promise<void>;
  beginTotpSetup: (challengeToken: string) => Promise<TotpSetupResponse>;
  completeTotpSetup: (setupToken: string, code: string) => Promise<void>;
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

  // When a request can't refresh the session, drop the user so RequireAuth redirects to login.
  useEffect(() => {
    const onExpired = () => {
      tokens.clear();
      setUser(null);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);

    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const applySession = useCallback((session: Session) => {
    tokens.set(session.accessToken, session.refreshToken);
    setUser({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      permissions: session.user.permissions,
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const result = unwrap(await api.POST("/auth/login", { body: { email, password } }));

      if (result.status === "authenticated" && result.session) {
        applySession(result.session);

        return { status: "authenticated" };
      }

      // totp_required / totp_setup_required both carry a challenge token for the second step.
      return { status: result.status, challengeToken: result.challengeToken ?? "" } as LoginOutcome;
    },
    [applySession],
  );

  const completeTotpLogin = useCallback(
    async (challengeToken: string, code: string) => {
      applySession(unwrap(await api.POST("/auth/2fa/login", { body: { challengeToken, code } })));
    },
    [applySession],
  );

  const beginTotpSetup = useCallback(
    async (challengeToken: string) =>
      unwrap(await api.POST("/auth/2fa/setup", { body: { challengeToken } })),
    [],
  );

  const completeTotpSetup = useCallback(
    async (setupToken: string, code: string) => {
      applySession(unwrap(await api.POST("/auth/2fa/confirm", { body: { setupToken, code } })));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.POST("/auth/logout");
    } finally {
      tokens.clear();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      completeTotpLogin,
      beginTotpSetup,
      completeTotpSetup,
      logout,
    }),
    [user, loading, login, completeTotpLogin, beginTotpSetup, completeTotpSetup, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = use(AuthContext);

  if (!context) {
    throw new ContextUsageError("useAuth must be used within an AuthProvider");
  }

  return context;
}
