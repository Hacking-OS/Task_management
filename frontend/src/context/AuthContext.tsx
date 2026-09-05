import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { api } from "../services/api";
import {
  clearAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
  setTokenRefreshHandler,
} from "../services/authToken";
import type { User } from "../models/types";

interface AuthContextValue {
  user: User | null;
  /** Short-lived access token held in memory only — never a refresh token. */
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, inviteToken?: string) => Promise<string[]>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapGenRef = useRef(0);

  const clearAuthState = useCallback(() => {
    clearAccessToken();
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = token;
    clearAuthState();
    try {
      await api.logout(currentToken ?? undefined);
    } catch {
      // Cookie/session may already be invalid — local state is cleared regardless.
    }
  }, [token, clearAuthState]);

  useEffect(() => {
    setTokenRefreshHandler((newToken) => {
      setAccessToken(newToken);
      setToken(newToken);
    });
    setSessionExpiredHandler(() => {
      clearAuthState();
    });
    return () => {
      setTokenRefreshHandler(null);
      setSessionExpiredHandler(null);
    };
  }, [clearAuthState]);

  useEffect(() => {
    const gen = ++bootstrapGenRef.current;
    setLoading(true);

    api
      .restoreSession()
      .then(({ accessToken, user: u }) => {
        if (gen !== bootstrapGenRef.current) return;
        setAccessToken(accessToken);
        setToken(accessToken);
        setUser(u);
      })
      .catch(() => {
        if (gen !== bootstrapGenRef.current) return;
        clearAuthState();
      })
      .finally(() => {
        if (gen === bootstrapGenRef.current) setLoading(false);
      });
  }, [clearAuthState]);

  const login = async (username: string, password: string) => {
    const { user: u, accessToken } = await api.login(username, password);
    setAccessToken(accessToken);
    setToken(accessToken);
    setUser(u);
  };

  const register = async (username: string, email: string, password: string, inviteToken?: string) => {
    const { user: u, accessToken, joined_workspace_ids } = await api.register(username, email, password, inviteToken);
    setAccessToken(accessToken);
    setToken(accessToken);
    setUser(u);
    return joined_workspace_ids ?? [];
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const { user: u } = await api.me(token);
      setUser(u);
    } catch {
      // Caller may show error; avoid unhandled rejection.
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
