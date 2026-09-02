import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { api } from "../services/api";
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

  const refresh = useCallback(async () => {
    if (!token || !activeWorkspace?.id) {
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const { members: list } = await api.listMembers(token, activeWorkspace.id);
      setMembers(list);
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
