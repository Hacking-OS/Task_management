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
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { api } from "../services/api";
import { getBackendOrigin } from "../config/backend";
import type { Notification } from "../models/types";

const FALLBACK_POLL_MS = 120000;

function matchesWorkspace(notification: Notification, workspaceId?: string): boolean {
  if (!workspaceId) return true;
  return notification.workspace_id === workspaceId || notification.workspace_id == null;
}

type NotificationContextValue = {
  notifications: Notification[];
  bellNotifications: Notification[];
  unreadCount: number;
  ringing: boolean;
  toast: Notification | null;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  acceptInvite: (inviteToken: string, notificationId: string) => Promise<void>;
  rejectInvite: (inviteToken: string, notificationId: string) => Promise<void>;
  connected: boolean;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { activeWorkspace, refresh: refreshWorkspaces } = useWorkspace();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ringing, setRinging] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const ringTimerRef = useRef<number | null>(null);

  const workspaceId = activeWorkspace?.id;

  const triggerRing = useCallback(() => {
    setRinging(true);
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = window.setTimeout(() => setRinging(false), 1200);
  }, []);

  const showToast = useCallback((notification: Notification) => {
    setToast(notification);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const handleIncoming = useCallback(
    (notification: Notification, nextUnread: number) => {
      setUnreadCount(nextUnread);

      if (!matchesWorkspace(notification, workspaceId)) return;

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev].slice(0, 100);
      });

      if (!notification.is_read && !seenIdsRef.current.has(notification.id)) {
        seenIdsRef.current.add(notification.id);
        triggerRing();
        showToast(notification);
      }
    },
    [workspaceId, triggerRing, showToast]
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const { notifications: list, unreadCount: count } = await api.getNotifications(token, workspaceId);
    setNotifications(list);
    setUnreadCount(count);
    for (const n of list) seenIdsRef.current.add(n.id);
    setLoading(false);
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();
  }, [token, workspaceId, refresh]);

  useEffect(() => {
    if (!token) return;

    const socket = io(getBackendOrigin(), {
      path: "/socket.io",
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      void refresh();
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("notification:new", (payload: { notification: Notification; unreadCount: number }) => {
      handleIncoming(payload.notification, payload.unreadCount);
    });

    socket.on("notification:sync", (payload: { unreadCount: number }) => {
      setUnreadCount(payload.unreadCount);
      if (payload.unreadCount === 0) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      }
    });

    socket.on("notification:removed", (payload: { id: string; unreadCount: number }) => {
      setUnreadCount(payload.unreadCount);
      setNotifications((prev) => prev.filter((n) => n.id !== payload.id));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, refresh, handleIncoming]);

  useEffect(() => {
    if (!token || connected) return;
    const id = window.setInterval(() => void refresh(), FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [token, connected, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return;
      const { unreadCount: count } = await api.markNotificationRead(token, id);
      setUnreadCount(count);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    },
    [token]
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    await api.markAllNotificationsRead(token);
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  }, [token]);

  const dismiss = useCallback(
    async (id: string) => {
      if (!token) return;
      await api.deleteNotification(token, id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      const { unreadCount: count } = await api.getNotifications(token, workspaceId);
      setUnreadCount(count);
    },
    [token, workspaceId]
  );

  const acceptInvite = useCallback(
    async (inviteToken: string, notificationId: string) => {
      if (!token) return;
      const { workspaceId: joinedId } = await api.acceptInvitation(token, inviteToken);
      await api.markNotificationRead(token, notificationId);
      await refreshWorkspaces();
      if (joinedId) await api.activateWorkspace(token, joinedId);
      await refreshWorkspaces();
      await refresh();
    },
    [token, refreshWorkspaces, refresh]
  );

  const rejectInvite = useCallback(
    async (inviteToken: string, notificationId: string) => {
      if (!token) return;
      await api.rejectInvitation(token, inviteToken);
      await api.markNotificationRead(token, notificationId);
      await refresh();
    },
    [token, refresh]
  );

  const bellNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      bellNotifications,
      unreadCount,
      ringing,
      toast,
      loading,
      refresh,
      markRead,
      markAllRead,
      dismiss,
      acceptInvite,
      rejectInvite,
      connected,
    }),
    [
      notifications,
      bellNotifications,
      unreadCount,
      ringing,
      toast,
      loading,
      refresh,
      markRead,
      markAllRead,
      dismiss,
      acceptInvite,
      rejectInvite,
      connected,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
