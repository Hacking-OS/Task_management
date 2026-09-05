import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { useToast } from "./ToastContext";
import { useSocket } from "./SocketContext";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { api, setWorkspaceSecurityVersion } from "../services/api";
import { can as canPerm, canApprove as canApprovePerm } from "../utils/permissionHelpers";
import { debounce } from "../utils/debounce";

interface PermissionsContextValue {
  /** Permissions for the active workspace only — not global. */
  permissions: string[];
  workspaceId: string | null;
  workspaceName: string | null;
  securityVersion: number;
  isOwner: boolean;
  isCreator: boolean;
  roleSlug: string | null;
  roleName: string | null;
  approvalFlowsEnabled: boolean;
  approvalDecidePermissions: string[];
  canDecideAnyApproval: boolean;
  loading: boolean;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasAllPermissions: (codes: string[]) => boolean;
  can: (code: string) => boolean;
  canApprove: (permissionCode: string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { activeWorkspace, refresh: refreshWorkspaces } = useWorkspace();
  const { subscribeWorkspaceChannel, unsubscribeWorkspaceChannel } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [securityVersion, setSecurityVersion] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [roleSlug, setRoleSlug] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [approvalFlowsEnabled, setApprovalFlowsEnabled] = useState(true);
  const [approvalDecidePermissions, setApprovalDecidePermissions] = useState<string[]>([]);
  const [canDecideAnyApproval, setCanDecideAnyApproval] = useState(false);
  const [loading, setLoading] = useState(false);
  const prevPermissionsRef = useRef<string[]>([]);
  const activeWorkspaceIdRef = useRef<string | undefined>(activeWorkspace?.id);
  const refreshInFlightRef = useRef<{ wsId: string; promise: Promise<void> } | null>(null);
  const lastSecurityRefreshRef = useRef(0);

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspace?.id;
  }, [activeWorkspace?.id]);

  const applyPermissions = useCallback((data: Awaited<ReturnType<typeof api.getMyPermissions>>) => {
    setPermissions(data.permissions);
    setWorkspaceId(data.workspace_id);
    setWorkspaceName(data.workspace_name);
    setIsOwner(data.is_owner);
    setIsCreator(data.is_creator);
    setRoleSlug(data.role_slug);
    setRoleName(data.role_name);
    setApprovalFlowsEnabled(data.approval_flows_enabled !== false);
    setApprovalDecidePermissions(data.approval_decide_permissions ?? []);
    setCanDecideAnyApproval(!!data.can_decide_any_approval || data.is_owner);
    const version = data.security_version ?? 0;
    setSecurityVersion(version);
    setWorkspaceSecurityVersion(version);
    prevPermissionsRef.current = data.permissions;
  }, []);

  const clearPermissions = useCallback(() => {
    setPermissions([]);
    setWorkspaceId(null);
    setWorkspaceName(null);
    setSecurityVersion(0);
    setWorkspaceSecurityVersion(undefined);
    setIsOwner(false);
    setIsCreator(false);
    setRoleSlug(null);
    setRoleName(null);
    setApprovalFlowsEnabled(true);
    setApprovalDecidePermissions([]);
    setCanDecideAnyApproval(false);
    prevPermissionsRef.current = [];
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !activeWorkspace?.id) {
      clearPermissions();
      return;
    }
    const wsId = activeWorkspace.id;
    if (refreshInFlightRef.current?.wsId === wsId) {
      return refreshInFlightRef.current.promise;
    }

    const promise = (async () => {
      setLoading(true);
      try {
        const data = await api.getMyPermissions(token, wsId);
        if (activeWorkspaceIdRef.current === wsId) {
          applyPermissions(data);
        }
      } catch {
        if (activeWorkspaceIdRef.current === wsId) {
          clearPermissions();
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
  }, [token, activeWorkspace?.id, applyPermissions, clearPermissions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleWorkspaceAccessRevoked = useCallback(async () => {
    clearPermissions();
    const wsId = activeWorkspaceIdRef.current;
    if (wsId) {
      unsubscribeWorkspaceChannel(wsId);
    }
    await refreshWorkspaces();
    toast.warning("Workspace access changed", "Your access to this workspace has changed.");
    navigate("/workspaces", { replace: true });
  }, [clearPermissions, refreshWorkspaces, toast, navigate, unsubscribeWorkspaceChannel]);

  const refreshForSecurityVersion = useCallback(
    (version: number) => {
      if (version > 0 && lastSecurityRefreshRef.current === version) return;
      lastSecurityRefreshRef.current = version;
      void refresh();
    },
    [refresh]
  );

  const debouncedSecurityRefresh = useMemo(
    () => debounce((version: number) => refreshForSecurityVersion(version), 300),
    [refreshForSecurityVersion]
  );

  useEffect(() => {
    return () => debouncedSecurityRefresh.cancel();
  }, [debouncedSecurityRefresh]);

  useEffect(() => {
    const wsId = activeWorkspace?.id;
    if (!wsId) return;

    void subscribeWorkspaceChannel(wsId);
    return () => unsubscribeWorkspaceChannel(wsId);
  }, [activeWorkspace?.id, subscribeWorkspaceChannel, unsubscribeWorkspaceChannel]);

  useSocketEvent<{ workspaceId: string; permissions: string[]; securityVersion?: number }>(
    "permissions:updated",
    (payload) => {
      if (payload.workspaceId !== activeWorkspaceIdRef.current) return;

      const before = new Set(prevPermissionsRef.current);
      const after = new Set(payload.permissions);
      const granted = payload.permissions.filter((p) => !before.has(p));
      const revoked = prevPermissionsRef.current.filter((p) => !after.has(p));

      if (granted.length > 0) {
        toast.success("Permission granted", `${granted.join(", ")}`);
      }
      if (revoked.length > 0) {
        toast.warning("Permission revoked", `${revoked.join(", ")}`);
      }

      if (payload.securityVersion) {
        setSecurityVersion(payload.securityVersion);
        setWorkspaceSecurityVersion(payload.securityVersion);
        lastSecurityRefreshRef.current = payload.securityVersion;
      }

      prevPermissionsRef.current = payload.permissions;
      setPermissions(payload.permissions);
    },
    !!token
  );

  useSocketEvent<{ workspaceId: string; securityVersion: number; event: string; changedAt: string; userId?: string }>(
    "security.changed",
    (payload) => {
      if (payload.event === "workspace.access.revoked" && payload.workspaceId === activeWorkspaceIdRef.current) {
        void handleWorkspaceAccessRevoked();
        return;
      }
      if (payload.workspaceId !== activeWorkspaceIdRef.current) return;

      setSecurityVersion(payload.securityVersion);
      setWorkspaceSecurityVersion(payload.securityVersion);
      toast.info("Security updated", "Your workspace permissions were refreshed.");
      debouncedSecurityRefresh(payload.securityVersion);
    },
    !!token
  );

  const hasPermission = useCallback((code: string) => permissions.includes(code), [permissions]);

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some((c) => permissions.includes(c)),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (codes: string[]) => codes.every((c) => permissions.includes(c)),
    [permissions]
  );

  const permCtx = useMemo(
    () => ({
      permissions,
      isOwner,
      approvalDecidePermissions,
    }),
    [permissions, isOwner, approvalDecidePermissions]
  );

  const can = useCallback((code: string) => canPerm(permCtx, code), [permCtx]);
  const canApprove = useCallback(
    (permissionCode: string) => canApprovePerm(permCtx, permissionCode),
    [permCtx]
  );

  const value = useMemo(
    () => ({
      permissions,
      workspaceId,
      workspaceName,
      securityVersion,
      isOwner,
      isCreator,
      roleSlug,
      roleName,
      approvalFlowsEnabled,
      approvalDecidePermissions,
      canDecideAnyApproval,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      can,
      canApprove,
      refresh,
    }),
    [
      permissions,
      workspaceId,
      workspaceName,
      securityVersion,
      isOwner,
      isCreator,
      roleSlug,
      roleName,
      approvalFlowsEnabled,
      approvalDecidePermissions,
      canDecideAnyApproval,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      can,
      canApprove,
      refresh,
    ]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}

/** Permissions apply to the active workspace only. */
export function useActiveWorkspacePermissions() {
  return usePermissions();
}
