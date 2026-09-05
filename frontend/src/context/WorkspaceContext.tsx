import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../services/api";
import { bumpWorkspaceGeneration } from "../services/requestCache";
import type { Workspace } from "../models/types";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | undefined;
  loading: boolean;
  switching: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function markActiveInList(list: Workspace[], activeId: string): Workspace[] {
  return list.map((w) => ({
    ...w,
    is_active: w.id === activeId ? 1 : 0,
    is_active_for_user: w.id === activeId,
  }));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | undefined>();
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setActiveWorkspace(undefined);
      setLoading(false);
      setReady(true);
      return;
    }
    setLoading(true);
    try {
      let { workspaces: list, active } = await api.getWorkspaces(token);

      if (list.length === 1 && !active) {
        const { workspace } = await api.activateWorkspace(token, list[0].id);
        active = workspace;
        list = markActiveInList(list, workspace.id);
      }

      setWorkspaces(list);
      setActiveWorkspace(active ?? undefined);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    setReady(false);
    void refresh();
  }, [refresh]);

  const setActive = async (id: string) => {
    if (!token) return;
    setSwitching(true);
    bumpWorkspaceGeneration();
    setActiveWorkspace(undefined);
    try {
      const { workspace } = await api.activateWorkspace(token, id);
      setWorkspaces((prev) => markActiveInList(prev, id));
      setActiveWorkspace(workspace);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, loading, switching, ready, refresh, setActive }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
