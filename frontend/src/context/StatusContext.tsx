import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { api } from "../services/api";
import type { StatusEntityType, WorkspaceStatus } from "../models/types";

interface StatusContextValue {
  statuses: WorkspaceStatus[];
  loading: boolean;
  refresh: () => Promise<void>;
  forEntity: (entityType: StatusEntityType) => WorkspaceStatus[];
  getStatus: (entityType: StatusEntityType, slug: string, workspaceId?: string) => WorkspaceStatus | undefined;
  isClosed: (entityType: StatusEntityType, slug: string, workspaceId?: string) => boolean;
}

const StatusContext = createContext<StatusContextValue | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [statuses, setStatuses] = useState<WorkspaceStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !activeWorkspace?.id) {
      setStatuses([]);
      return;
    }
    setLoading(true);
    try {
      const { statuses: list } = await api.getWorkspaceStatuses(token, activeWorkspace.id);
      setStatuses(list);
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const forEntity = useCallback(
    (entityType: StatusEntityType) =>
      statuses
        .filter((s) => s.entity_type === entityType && s.workspace_id === activeWorkspace?.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    [statuses, activeWorkspace?.id]
  );

  const getStatus = useCallback(
    (entityType: StatusEntityType, slug: string, workspaceId?: string) => {
      const wsId = workspaceId ?? activeWorkspace?.id;
      return statuses.find((s) => s.workspace_id === wsId && s.entity_type === entityType && s.slug === slug);
    },
    [statuses, activeWorkspace?.id]
  );

  const isClosed = useCallback(
    (entityType: StatusEntityType, slug: string, workspaceId?: string) =>
      getStatus(entityType, slug, workspaceId)?.is_closed === 1,
    [getStatus]
  );

  const value = useMemo(
    () => ({ statuses, loading, refresh, forEntity, getStatus, isClosed }),
    [statuses, loading, refresh, forEntity, getStatus, isClosed]
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatuses() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatuses must be used within StatusProvider");
  return ctx;
}
