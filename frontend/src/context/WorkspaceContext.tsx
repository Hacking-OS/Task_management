import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../services/api";
import type { Workspace } from "../models/types";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | undefined>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setActiveWorkspace(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { workspaces: list, active } = await api.getWorkspaces(token);
      setWorkspaces(list);
      setActiveWorkspace(active);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActive = async (id: string) => {
    if (!token) return;
    const { workspace } = await api.activateWorkspace(token, id);
    setActiveWorkspace(workspace);
    await refresh();
  };

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, loading, refresh, setActive }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
