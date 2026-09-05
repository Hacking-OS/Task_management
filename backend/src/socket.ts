import type { Server as HttpServer } from "http";
import type { Socket } from "socket.io";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth.js";
import { validateSession } from "./services/sessions.js";
import { logSecurityEvent } from "./services/securityEvents.js";
import {
  authorizeTeamSubscribe,
  authorizeWorkspaceSubscribe,
  cleanupSocketRateLimit,
  initSocketAuthData,
  leaveAllAuthorizedRooms,
  leaveWorkspaceRoom,
  revalidateSocketSubscriptions,
  trackTeamSubscribe,
  trackTeamUnsubscribe,
  trackWorkspaceSubscribe,
  trackWorkspaceUnsubscribe,
  validateSocketSession,
} from "./services/socketSecurity.js";
import type { Notification } from "./types.js";

let io: Server | null = null;

const REVALIDATE_INTERVAL_MS = 45_000;

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function teamRoom(teamId: string): string {
  return `team:${teamId}`;
}

const roomFns = {
  workspace: workspaceRoom,
  team: teamRoom,
};

function denyConnection(
  next: (err?: Error) => void,
  reason: string,
  action: string,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM"
): void {
  logSecurityEvent({
    action,
    result: "DENIED",
    reason,
    httpMethod: "SOCKET",
    route: "connection",
    resourceType: "socket",
    riskLevel,
    userAgent: "",
  });
  next(new Error(reason));
}

function registerSocketHandlers(socket: Socket): void {
  const userId = socket.data.userId as string;

  socket.join(userRoom(userId));

  socket.on("workspace:subscribe", (workspaceId: unknown, ack?: (res: unknown) => void) => {
    const result = authorizeWorkspaceSubscribe(socket, workspaceId);
    if (!result.ok) {
      ack?.({ ok: false, error: result.reason });
      return;
    }
    const wsId = workspaceId as string;
    socket.join(workspaceRoom(wsId));
    trackWorkspaceSubscribe(socket, wsId);
    ack?.({ ok: true, securityVersion: result.securityVersion });
  });

  socket.on("workspace:unsubscribe", (workspaceId: unknown) => {
    if (typeof workspaceId !== "string" || !workspaceId) return;
    leaveWorkspaceRoom(socket, workspaceId, (room) => socket.leave(room), workspaceRoom(workspaceId));
  });

  socket.on("team:subscribe", (teamId: unknown, ack?: (res: unknown) => void) => {
    const result = authorizeTeamSubscribe(socket, teamId);
    if (!result.ok) {
      ack?.({ ok: false, error: result.reason });
      return;
    }
    const id = teamId as string;
    socket.join(teamRoom(id));
    trackTeamSubscribe(socket, id);
    ack?.({ ok: true, securityVersion: result.securityVersion });
  });

  socket.on("team:unsubscribe", (teamId: unknown) => {
    if (typeof teamId !== "string" || !teamId) return;
    socket.leave(teamRoom(teamId));
    trackTeamUnsubscribe(socket, teamId);
  });

  socket.on("security:revalidate", () => {
    if (!validateSocketSession(socket)) return;
    revalidateSocketSubscriptions(socket, (room) => socket.leave(room), roomFns);
  });

  socket.on("disconnect", () => {
    cleanupSocketRateLimit(socket.id);
    leaveAllAuthorizedRooms(socket, (room) => socket.leave(room), roomFns);
  });
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const queryToken = socket.handshake.query?.token;
    const token =
      (typeof authToken === "string" && authToken) ||
      (typeof queryToken === "string" && queryToken) ||
      null;

    if (!token) {
      denyConnection(next, "Unauthorized", "SOCKET_AUTH_REQUIRED", "LOW");
      return;
    }

    const payload = verifyToken(token);
    if (!payload?.sub) {
      denyConnection(next, "Unauthorized", "SOCKET_TOKEN_INVALID", "MEDIUM");
      return;
    }

    if (payload.sid) {
      const session = validateSession(payload.sid, payload.sub);
      if (!session) {
        denyConnection(next, "Session revoked", "SOCKET_SESSION_REVOKED", "HIGH");
        return;
      }
      initSocketAuthData(socket, payload.sub, payload.sid);
    } else {
      denyConnection(next, "Session required", "SOCKET_SESSION_REQUIRED", "MEDIUM");
      return;
    }

    next();
  });

  io.on("connection", (socket) => {
    registerSocketHandlers(socket);

    const interval = setInterval(() => {
      if (!socket.connected) return;
      revalidateSocketSubscriptions(socket, (room) => socket.leave(room), roomFns);
    }, REVALIDATE_INTERVAL_MS);

    socket.on("disconnect", () => clearInterval(interval));
  });

  return io;
}

export function revokeUserWorkspaceSockets(userId: string, workspaceId: string): void {
  if (!io) return;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId !== userId) continue;
    leaveWorkspaceRoom(socket, workspaceId, (room) => socket.leave(room), workspaceRoom(workspaceId));
    socket.emit("security.changed", {
      workspaceId,
      securityVersion: 0,
      event: "workspace.access.revoked",
      changedAt: new Date().toISOString(),
    });
  }
}

export function disconnectSessionSockets(sessionId: string): void {
  if (!io) return;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.sessionId !== sessionId) continue;
    socket.emit("security.session_revoked", { reason: "Session revoked" });
    socket.disconnect(true);
  }
}

export function emitNotification(userId: string, notification: Notification, unreadCount: number): void {
  io?.to(userRoom(userId)).emit("notification:new", { notification, unreadCount });
}

export function emitUnreadSync(userId: string, unreadCount: number): void {
  io?.to(userRoom(userId)).emit("notification:sync", { unreadCount });
}

export function emitNotificationRemoved(userId: string, id: string, unreadCount: number): void {
  io?.to(userRoom(userId)).emit("notification:removed", { id, unreadCount });
}

export function emitPermissionsUpdated(
  userId: string,
  workspaceId: string,
  payload: { permissions: string[]; securityVersion?: number }
): void {
  io?.to(userRoom(userId)).emit("permissions:updated", { workspaceId, ...payload });
}

export function emitApprovalChanged(
  userId: string,
  payload: {
    workspaceId: string;
    action: string;
    permissionCode: string;
    requesterId: string;
    actorUserId?: string | null;
    request: Record<string, unknown>;
  }
): void {
  io?.to(userRoom(userId)).emit("approvals:changed", payload);
}

export interface SecurityChangedPayload {
  workspaceId: string;
  securityVersion: number;
  event: string;
  changedAt: string;
}

export function emitSecurityChanged(userId: string, payload: SecurityChangedPayload): void {
  io?.to(userRoom(userId)).emit("security.changed", payload);
  io?.to(workspaceRoom(payload.workspaceId)).emit("security.changed", { ...payload, userId });

  if (payload.event === "workspace.access.revoked") {
    revokeUserWorkspaceSockets(userId, payload.workspaceId);
  }
}
