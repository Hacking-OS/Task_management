import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { api } from "../services/api";

interface PermissionsContextValue {
  permissions: string[];
  isOwner: boolean;
  isCreator: boolean;
  roleSlug: string | null;
  roleName: string | null;
  loading: boolean;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasAllPermissions: (codes: string[]) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [roleSlug, setRoleSlug] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !activeWorkspace?.id) {
      setPermissions([]);
      setIsOwner(false);
      setIsCreator(false);
      setRoleSlug(null);
      setRoleName(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getMyPermissions(token, activeWorkspace.id);
      setPermissions(data.permissions);
      setIsOwner(data.is_owner);
      setIsCreator(data.is_creator);
      setRoleSlug(data.role_slug);
      setRoleName(data.role_name);
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasPermission = useCallback((code: string) => permissions.includes(code), [permissions]);

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some((c) => permissions.includes(c)),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (codes: string[]) => codes.every((c) => permissions.includes(c)),
    [permissions]
  );

  const value = useMemo(
    () => ({
      permissions,
      isOwner,
      isCreator,
      roleSlug,
      roleName,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refresh,
    }),
    [permissions, isOwner, isCreator, roleSlug, roleName, loading, hasPermission, hasAnyPermission, hasAllPermissions, refresh]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}
