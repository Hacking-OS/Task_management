import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { api } from "../services/api";
import { debounce } from "../utils/debounce";
import type { WorkspaceMember } from "../models/types";

interface MembersContextValue {
  members: WorkspaceMember[];
  loading: boolean;
  refresh: () => Promise<void>;
  getMemberByUserId: (userId: string) => WorkspaceMember | undefined;
}

const MembersContext = createContext<MembersContextValue | null>(null);

export function MembersProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const activeWorkspaceIdRef = useRef<string | undefined>(activeWorkspace?.id);
  const refreshInFlightRef = useRef<{ wsId: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspace?.id;
  }, [activeWorkspace?.id]);

  const refresh = useCallback(async () => {
    if (!token || !activeWorkspace?.id) {
      setMembers([]);
      return;
    }
    const wsId = activeWorkspace.id;
    if (refreshInFlightRef.current?.wsId === wsId) {
      return refreshInFlightRef.current.promise;
    }

    const promise = (async () => {
      setLoading(true);
      try {
        const { members: list } = await api.listMembers(token, wsId);
        if (activeWorkspaceIdRef.current === wsId) {
          setMembers(list);
        }
      } catch {
        if (activeWorkspaceIdRef.current === wsId) {
          setMembers([]);
        }
      } finally {
        if (refreshInFlightRef.current?.wsId === wsId) {
          refreshInFlightRef.current = null;
        }
        setLoading(false);
      }
    })();

    refreshInFlightRef.current = { wsId, promise };
    return promise;
  }, [token, activeWorkspace?.id]);

  const debouncedRefresh = useMemo(() => debounce(() => void refresh(), 300), [refresh]);

  useEffect(() => {
    return () => debouncedRefresh.cancel();
  }, [debouncedRefresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSocketEvent<{ workspaceId: string }>(
    "permissions:updated",
    (payload) => {
      if (payload.workspaceId === activeWorkspace?.id) {
        debouncedRefresh();
      }
    },
    !!token && !!activeWorkspace?.id
  );

  const byUserId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const getMemberByUserId = useCallback((userId: string) => byUserId.get(userId), [byUserId]);

  const value = useMemo(
    () => ({ members, loading, refresh, getMemberByUserId }),
    [members, loading, refresh, getMemberByUserId]
  );

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}

export function useMembers() {
  const ctx = useContext(MembersContext);
  if (!ctx) throw new Error("useMembers must be used within MembersProvider");
  return ctx;
}
