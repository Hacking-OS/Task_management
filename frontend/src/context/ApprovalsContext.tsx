import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { useToast } from "./ToastContext";
import { usePermissions } from "./PermissionsContext";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { api } from "../services/api";
import { debounce } from "../utils/debounce";
import type { ApprovalRequest } from "../models/types";

export type ApprovalChangeAction = "created" | "approved" | "rejected" | "executed";

interface ApprovalChangedEvent {
  workspaceId: string;
  action: ApprovalChangeAction;
  permissionCode: string;
  requesterId: string;
  actorUserId?: string | null;
  request: {
    id: string;
    permission_code: string;
    permission_name: string;
    title: string;
    status: string;
    requester_username: string;
    attempt_number?: number;
  };
}

interface ApprovalsContextValue {
  pendingApprovals: ApprovalRequest[];
  myApprovals: ApprovalRequest[];
  pendingCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null);

export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { canDecideAnyApproval, approvalFlowsEnabled, securityVersion } = usePermissions();
  const toast = useToast();

  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [myApprovals, setMyApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const activeWorkspaceIdRef = useRef<string | undefined>(activeWorkspace?.id);
  const refreshInFlightRef = useRef<{ wsId: string; promise: Promise<void> } | null>(null);

  const wsId = activeWorkspace?.id;

  useEffect(() => {
    activeWorkspaceIdRef.current = wsId;
  }, [wsId]);

  const refresh = useCallback(async () => {
    if (!token || !wsId || !approvalFlowsEnabled) {
      setPendingApprovals([]);
      setMyApprovals([]);
      return;
    }
    if (refreshInFlightRef.current?.wsId === wsId) {
      return refreshInFlightRef.current.promise;
    }

    const promise = (async () => {
      setLoading(true);
      try {
        const mine = await api.listMyApprovalRequests(token, wsId);
        if (activeWorkspaceIdRef.current !== wsId) return;
        setMyApprovals(mine.requests);
        if (canDecideAnyApproval) {
          const pending = await api.listPendingApprovals(token, wsId);
          if (activeWorkspaceIdRef.current !== wsId) return;
          setPendingApprovals(pending.requests);
        } else {
          setPendingApprovals([]);
        }
      } catch {
        if (activeWorkspaceIdRef.current === wsId) {
          setPendingApprovals([]);
          setMyApprovals([]);
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
  }, [token, wsId, canDecideAnyApproval, approvalFlowsEnabled]);

  const debouncedRefresh = useMemo(() => debounce(() => void refresh(), 300), [refresh]);

  useEffect(() => {
    return () => debouncedRefresh.cancel();
  }, [debouncedRefresh]);

  useEffect(() => {
    void refresh();
  }, [refresh, securityVersion, canDecideAnyApproval]);

  useSocketEvent<ApprovalChangedEvent>(
    "approvals:changed",
    (payload) => {
      if (payload.workspaceId !== wsId) return;

      const isRequester = payload.requesterId === user?.id;
      const isActor = payload.actorUserId === user?.id;
      const reqSummary = payload.request;

      if (payload.action === "created") {
        if (canDecideAnyApproval && !isRequester) {
          toast.info(
            "New approval request",
            `${reqSummary.requester_username} requested ${reqSummary.permission_name}`
          );
        }
      } else if (payload.action === "executed") {
        if (isRequester) {
          toast.success("Approval granted", `You were granted: ${reqSummary.permission_name}`);
        } else if (isActor) {
          toast.success("Approved", `${reqSummary.requester_username} — ${reqSummary.permission_name}`);
        } else if (canDecideAnyApproval) {
          toast.success("Request approved", `${reqSummary.requester_username} — ${reqSummary.permission_name}`);
        }
      } else if (payload.action === "rejected") {
        if (isRequester) {
          toast.warning("Approval rejected", `Your request for ${reqSummary.permission_name} was rejected`);
        } else if (isActor) {
          toast.info("Rejected", `${reqSummary.requester_username} — ${reqSummary.permission_name}`);
        } else if (canDecideAnyApproval) {
          toast.info("Request rejected", `${reqSummary.requester_username} — ${reqSummary.permission_name}`);
        }
      }

      debouncedRefresh();
    },
    !!token && !!wsId
  );

  const value = useMemo(
    () => ({
      pendingApprovals,
      myApprovals,
      pendingCount: pendingApprovals.length,
      loading,
      refresh,
    }),
    [pendingApprovals, myApprovals, loading, refresh]
  );

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>;
}

export function useApprovals() {
  const ctx = useContext(ApprovalsContext);
  if (!ctx) throw new Error("useApprovals must be used within ApprovalsProvider");
  return ctx;
}
