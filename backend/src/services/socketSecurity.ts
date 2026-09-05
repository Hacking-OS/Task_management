import type { Socket } from "socket.io";
import { db } from "../db.js";
import { isWorkspaceMember, isWorkspaceOwner } from "./authorization.js";
import { getMemberSecurityVersion } from "./securityVersion.js";
import { validateSession } from "./sessions.js";
import { isTeamLead } from "./teams.js";
import { logSecurityEvent } from "./securityEvents.js";

const SUBSCRIBE_RATE_WINDOW_MS = 60_000;
const SUBSCRIBE_RATE_MAX = 30;

const subscribeAttempts = new Map<string, { count: number; windowStart: number }>();

export function initSocketAuthData(socket: Socket, userId: string, sessionId?: string): void {
  socket.data.userId = userId;
  if (sessionId) socket.data.sessionId = sessionId;
  socket.data.subscribedWorkspaces = new Set<string>();
  socket.data.subscribedTeams = new Set<string>();
}

function socketUserId(socket: Socket): string {
  return socket.data.userId as string;
}

function socketSessionId(socket: Socket): string | undefined {
  return socket.data.sessionId as string | undefined;
}

function subscribedWorkspaces(socket: Socket): Set<string> {
  if (!(socket.data.subscribedWorkspaces instanceof Set)) {
    socket.data.subscribedWorkspaces = new Set<string>();
  }
  return socket.data.subscribedWorkspaces as Set<string>;
}

function subscribedTeams(socket: Socket): Set<string> {
  if (!(socket.data.subscribedTeams instanceof Set)) {
    socket.data.subscribedTeams = new Set<string>();
  }
  return socket.data.subscribedTeams as Set<string>;
}

function rateLimitSubscribe(socket: Socket): boolean {
  const key = socket.id;
  const now = Date.now();
  const entry = subscribeAttempts.get(key);
  if (!entry || now - entry.windowStart > SUBSCRIBE_RATE_WINDOW_MS) {
    subscribeAttempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= SUBSCRIBE_RATE_MAX;
}

function logSocketDenial(
  socket: Socket,
  action: string,
  reason: string,
  extras?: { workspaceId?: string; teamId?: string; riskLevel?: "LOW" | "MEDIUM" | "HIGH" }
): void {
  logSecurityEvent({
    sessionId: socketSessionId(socket) ?? null,
    actorUserId: socketUserId(socket),
    workspaceId: extras?.workspaceId ?? null,
    teamId: extras?.teamId ?? null,
    userAgent: typeof socket.handshake.headers["user-agent"] === "string"
      ? socket.handshake.headers["user-agent"].slice(0, 512)
      : "",
    sourceIp: socket.handshake.address,
    httpMethod: "SOCKET",
    route: action,
    action,
    resourceType: "socket",
    result: "DENIED",
    reason,
    statusCode: 403,
    riskLevel: extras?.riskLevel ?? "MEDIUM",
  });
}

/** Re-validate JWT session on every sensitive socket operation. */
export function validateSocketSession(socket: Socket): boolean {
  const userId = socketUserId(socket);
  const sessionId = socketSessionId(socket);
  if (!sessionId) return true;
  const session = validateSession(sessionId, userId);
  if (!session) {
    logSocketDenial(socket, "SOCKET_REVOKED_SESSION", "Session revoked or expired", { riskLevel: "HIGH" });
    socket.emit("security.session_revoked", { reason: "Session expired or revoked" });
    socket.disconnect(true);
    return false;
  }
  return true;
}

export interface SubscribeResult {
  ok: boolean;
  reason?: string;
  securityVersion?: number;
}

export function authorizeWorkspaceSubscribe(socket: Socket, workspaceId: unknown): SubscribeResult {
  if (!validateSocketSession(socket)) {
    return { ok: false, reason: "Session invalid" };
  }

  if (!rateLimitSubscribe(socket)) {
    logSocketDenial(socket, "SOCKET_RATE_LIMIT", "Too many subscribe attempts", { riskLevel: "HIGH" });
    return { ok: false, reason: "Rate limit exceeded" };
  }

  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    return { ok: false, reason: "Invalid workspace id" };
  }

  const userId = socketUserId(socket);
  if (!isWorkspaceMember(userId, workspaceId)) {
    logSocketDenial(socket, "SOCKET_WORKSPACE_DENIED", "Not a workspace member", {
      workspaceId,
      riskLevel: "HIGH",
    });
    return { ok: false, reason: "Workspace access denied" };
  }

  return { ok: true, securityVersion: getMemberSecurityVersion(workspaceId, userId) };
}

function memberIdForUser(workspaceId: string, userId: string): string | undefined {
  const row = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { id: string } | undefined;
  return row?.id;
}

function isTeamMember(memberId: string, teamId: string): boolean {
  return !!db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?").get(teamId, memberId);
}

export function authorizeTeamSubscribe(socket: Socket, teamId: unknown): SubscribeResult {
  if (!validateSocketSession(socket)) {
    return { ok: false, reason: "Session invalid" };
  }

  if (!rateLimitSubscribe(socket)) {
    logSocketDenial(socket, "SOCKET_RATE_LIMIT", "Too many subscribe attempts", { riskLevel: "HIGH" });
    return { ok: false, reason: "Rate limit exceeded" };
  }

  if (typeof teamId !== "string" || !teamId.trim()) {
    return { ok: false, reason: "Invalid team id" };
  }

  const userId = socketUserId(socket);
  const team = db.prepare(`
    SELECT id, workspace_id FROM workspace_teams WHERE id = ?
  `).get(teamId) as { id: string; workspace_id: string } | undefined;

  if (!team) {
    logSocketDenial(socket, "SOCKET_TEAM_DENIED", "Team not found", { teamId, riskLevel: "MEDIUM" });
    return { ok: false, reason: "Team not found" };
  }

  if (!isWorkspaceMember(userId, team.workspace_id)) {
    logSocketDenial(socket, "SOCKET_TEAM_DENIED", "Not a workspace member", {
      workspaceId: team.workspace_id,
      teamId,
      riskLevel: "HIGH",
    });
    return { ok: false, reason: "Workspace access denied" };
  }

  if (isWorkspaceOwner(userId, team.workspace_id) || isTeamLead(userId, teamId)) {
    return { ok: true, securityVersion: getMemberSecurityVersion(team.workspace_id, userId) };
  }

  const memberId = memberIdForUser(team.workspace_id, userId);
  if (!memberId || !isTeamMember(memberId, teamId)) {
    logSocketDenial(socket, "SOCKET_TEAM_DENIED", "Not a team member", {
      workspaceId: team.workspace_id,
      teamId,
      riskLevel: "MEDIUM",
    });
    return { ok: false, reason: "Team access denied" };
  }

  return { ok: true, securityVersion: getMemberSecurityVersion(team.workspace_id, userId) };
}

export function trackWorkspaceSubscribe(socket: Socket, workspaceId: string): void {
  subscribedWorkspaces(socket).add(workspaceId);
}

export function trackWorkspaceUnsubscribe(socket: Socket, workspaceId: string): void {
  subscribedWorkspaces(socket).delete(workspaceId);
}

export function trackTeamSubscribe(socket: Socket, teamId: string): void {
  subscribedTeams(socket).add(teamId);
}

export function trackTeamUnsubscribe(socket: Socket, teamId: string): void {
  subscribedTeams(socket).delete(teamId);
}

export function leaveAllAuthorizedRooms(
  socket: Socket,
  leaveRoom: (room: string) => void,
  rooms: { workspace: (id: string) => string; team: (id: string) => string }
): void {
  for (const workspaceId of subscribedWorkspaces(socket)) {
    leaveRoom(rooms.workspace(workspaceId));
  }
  subscribedWorkspaces(socket).clear();

  for (const teamId of subscribedTeams(socket)) {
    leaveRoom(rooms.team(teamId));
  }
  subscribedTeams(socket).clear();
}

export function leaveWorkspaceRoom(
  socket: Socket,
  workspaceId: string,
  leaveRoom: (room: string) => void,
  roomName: string
): void {
  leaveRoom(roomName);
  trackWorkspaceUnsubscribe(socket, workspaceId);
}

export function revalidateSocketSubscriptions(
  socket: Socket,
  leaveRoom: (room: string) => void,
  rooms: { workspace: (id: string) => string; team: (id: string) => string }
): void {
  if (!validateSocketSession(socket)) return;

  const userId = socketUserId(socket);

  for (const workspaceId of [...subscribedWorkspaces(socket)]) {
    if (!isWorkspaceMember(userId, workspaceId)) {
      leaveRoom(rooms.workspace(workspaceId));
      subscribedWorkspaces(socket).delete(workspaceId);
      socket.emit("security.changed", {
        workspaceId,
        securityVersion: 0,
        event: "workspace.access.revoked",
        changedAt: new Date().toISOString(),
      });
    }
  }

  for (const teamId of [...subscribedTeams(socket)]) {
    const result = authorizeTeamSubscribe(socket, teamId);
    if (!result.ok) {
      leaveRoom(rooms.team(teamId));
      subscribedTeams(socket).delete(teamId);
    }
  }
}

export function cleanupSocketRateLimit(socketId: string): void {
  subscribeAttempts.delete(socketId);
}
