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
import { useToast } from "./ToastContext";
import { getBackendOrigin } from "../config/backend";
import { isSocketAuthError, subscribeWorkspace, unsubscribeWorkspace } from "../utils/socketSecurity";

type EventHandler = (payload: unknown) => void;

interface SocketContextValue {
  connected: boolean;
  socket: Socket | null;
  subscribe: <T>(event: string, handler: (payload: T) => void) => () => void;
  subscribeWorkspaceChannel: (workspaceId: string) => Promise<void>;
  unsubscribeWorkspaceChannel: (workspaceId: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef(new Map<string, Set<EventHandler>>());
  const subscribedWorkspacesRef = useRef(new Set<string>());
  const desiredWorkspacesRef = useRef(new Set<string>());

  const emitToLocal = useCallback((event: string, payload: unknown) => {
    const handlers = listenersRef.current.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(payload);
    }
  }, []);

  const subscribe = useCallback(<T,>(event: string, handler: (payload: T) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    const wrapped = handler as EventHandler;
    listenersRef.current.get(event)!.add(wrapped);

    return () => {
      listenersRef.current.get(event)?.delete(wrapped);
    };
  }, []);

  const subscribeWorkspaceChannel = useCallback(async (workspaceId: string) => {
    desiredWorkspacesRef.current.add(workspaceId);
    const socket = socketRef.current;
    if (!socket?.connected || subscribedWorkspacesRef.current.has(workspaceId)) return;

    const ack = await subscribeWorkspace(socket, workspaceId);
    if (ack.ok) {
      subscribedWorkspacesRef.current.add(workspaceId);
    } else if (ack.error?.toLowerCase().includes("access denied")) {
      emitToLocal("security.changed", {
        workspaceId,
        securityVersion: 0,
        event: "workspace.access.revoked",
        changedAt: new Date().toISOString(),
      });
    }
  }, [emitToLocal]);

  const resubscribeWorkspaces = useCallback(async () => {
    subscribedWorkspacesRef.current.clear();
    for (const workspaceId of desiredWorkspacesRef.current) {
      await subscribeWorkspaceChannel(workspaceId);
    }
  }, [subscribeWorkspaceChannel]);

  const unsubscribeWorkspaceChannel = useCallback((workspaceId: string) => {
    desiredWorkspacesRef.current.delete(workspaceId);
    const socket = socketRef.current;
    if (!socket) return;
    unsubscribeWorkspace(socket, workspaceId);
    subscribedWorkspacesRef.current.delete(workspaceId);
  }, []);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      subscribedWorkspacesRef.current.clear();
      desiredWorkspacesRef.current.clear();
      setConnected(false);
      return;
    }

    const socket = io(getBackendOrigin(), {
      path: "/socket.io",
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: true,
    });
    socketRef.current = socket;

    const forward = (event: string) => (payload: unknown) => emitToLocal(event, payload);

    socket.on("connect", () => {
      setConnected(true);
      void resubscribeWorkspaces();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err: Error) => {
      if (isSocketAuthError(err.message)) {
        toast.warning("Session ended", "Please sign in again.");
        void logout();
      }
    });
    socket.on("security.session_revoked", () => {
      toast.warning("Session ended", "Your session was revoked.");
      void logout();
    });

    socket.on("notification:new", forward("notification:new"));
    socket.on("notification:sync", forward("notification:sync"));
    socket.on("notification:removed", forward("notification:removed"));
    socket.on("permissions:updated", forward("permissions:updated"));
    socket.on("security.changed", forward("security.changed"));
    socket.on("approvals:changed", forward("approvals:changed"));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      subscribedWorkspacesRef.current.clear();
      setConnected(false);
    };
  }, [token, logout, toast, emitToLocal, resubscribeWorkspaces]);

  const value = useMemo(
    () => ({
      connected,
      socket: socketRef.current,
      subscribe,
      subscribeWorkspaceChannel,
      unsubscribeWorkspaceChannel,
    }),
    [connected, subscribe, subscribeWorkspaceChannel, unsubscribeWorkspaceChannel]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
