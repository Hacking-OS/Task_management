import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { avatarUrlForUser } from "./files.js";
import { acceptAllPendingInvitationsForUser, acceptInvitation } from "./workspaceMembers.js";
import { validateEmail, validateLoginIdentifier, validatePassword, validateUsername } from "../validation/common.js";
import {
  createAuthenticatedSession,
  revokeSession,
  revokeSessionByRefreshToken,
  rotateRefreshSession,
  RefreshTokenReuseError,
  revokeAllSessions,
} from "./sessions.js";
import { disconnectSessionSockets } from "../socket.js";
import { logSecurityEvent } from "./securityEvents.js";
import type { User } from "../types.js";

function mapUser(row: { id: string; username: string; email: string; created_at: string }): User {
  return {
    ...row,
    avatar_url: avatarUrlForUser(row.id),
  };
}

export interface AuthSessionPayload {
  user: User;
  accessToken: string;
  expiresIn: number;
  /** Raw refresh token — for HttpOnly cookie only; never include in JSON responses. */
  refreshToken: string;
  sessionId: string;
}

export interface RegisterResult extends AuthSessionPayload {
  joined_workspace_ids: string[];
}

export function register(
  username: string,
  email: string,
  password: string,
  inviteToken?: string,
  meta?: { userAgent?: string; ip?: string; requestId?: string }
): RegisterResult {
  const validUsername = validateUsername(username);
  const validEmail = validateEmail(email);
  const validPassword = validatePassword(password);

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ? OR email = ?")
    .get(validUsername, validEmail);
  if (existing) {
    logSecurityEvent({
      action: "REGISTER_FAILED",
      result: "DENIED",
      reason: "Duplicate username or email",
      statusCode: 400,
      riskLevel: "LOW",
    });
    throw new Error("Username or email already exists");
  }

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(validPassword, 10);
  db.prepare(
    "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)"
  ).run(id, validUsername, validEmail, hash);

  const user = mapUser(db.prepare("SELECT id, username, email, created_at FROM users WHERE id = ?").get(id) as User);
  const joined = new Set<string>();

  if (inviteToken) {
    try {
      const { workspaceId } = acceptInvitation(id, inviteToken);
      joined.add(workspaceId);
    } catch {
      // Invite token invalid or email mismatch — user can accept from onboarding later.
    }
  }

  for (const workspaceId of acceptAllPendingInvitationsForUser(id)) {
    joined.add(workspaceId);
  }

  ActivityLogger.log({
    userId: id,
    entityType: "user",
    entityId: id,
    action: "registered",
    description: `Account created for ${validUsername}`,
  });
  notify({
    userId: id,
    type: "success",
    title: "Welcome!",
    message: `Account created for ${validUsername}.`,
    entityType: "user",
    entityId: id,
  });

  const auth = createAuthenticatedSession(id, meta?.userAgent ?? "", meta?.ip);
  logSecurityEvent({
    requestId: meta?.requestId,
    actorUserId: id,
    sessionId: auth.session.id,
    action: "REGISTER_SUCCESS",
    result: "SUCCESS",
    riskLevel: "INFO",
  });

  return {
    user,
    accessToken: auth.accessToken,
    expiresIn: auth.expiresIn,
    refreshToken: auth.refreshToken,
    sessionId: auth.session.id,
    joined_workspace_ids: Array.from(joined),
  };
}

export function login(
  identifier: string,
  password: string,
  meta?: { userAgent?: string; ip?: string; requestId?: string }
): AuthSessionPayload {
  const validIdentifier = validateLoginIdentifier(identifier);
  assertPasswordProvided(password);

  const row = db
    .prepare(`
      SELECT id, username, email, password_hash, created_at FROM users
      WHERE username = ? OR email = ?
    `)
    .get(validIdentifier, validIdentifier.toLowerCase()) as (User & { password_hash: string }) | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    logSecurityEvent({
      requestId: meta?.requestId,
      userAgent: meta?.userAgent,
      sourceIp: meta?.ip,
      action: "LOGIN_FAILED",
      result: "DENIED",
      reason: "Invalid credentials",
      statusCode: 401,
      riskLevel: "MEDIUM",
    });
    throw new Error("Invalid username or password");
  }

  const user = mapUser(row);
  const auth = createAuthenticatedSession(row.id, meta?.userAgent ?? "", meta?.ip);

  logSecurityEvent({
    requestId: meta?.requestId,
    sessionId: auth.session.id,
    actorUserId: row.id,
    userAgent: meta?.userAgent,
    sourceIp: meta?.ip,
    action: "LOGIN_SUCCESS",
    result: "SUCCESS",
    riskLevel: "INFO",
  });
  ActivityLogger.log({
    userId: row.id,
    entityType: "user",
    entityId: row.id,
    action: "login",
    description: `${row.username} signed in`,
  });
  notify({
    userId: row.id,
    type: "login",
    title: "Login successful",
    message: `Welcome back, ${row.username}!`,
    entityType: "user",
    entityId: row.id,
  });

  return {
    user,
    accessToken: auth.accessToken,
    expiresIn: auth.expiresIn,
    refreshToken: auth.refreshToken,
    sessionId: auth.session.id,
  };
}

export function refreshSession(
  rawRefreshToken: string,
  meta?: { userAgent?: string; ip?: string; requestId?: string }
): AuthSessionPayload {
  try {
    const rotated = rotateRefreshSession(rawRefreshToken, meta);
    const user = getUser(rotated.session.user_id);
    if (!user) throw new Error("User not found");
    return {
      user,
      accessToken: rotated.accessToken,
      expiresIn: rotated.expiresIn,
      refreshToken: rotated.refreshToken,
      sessionId: rotated.session.id,
    };
  } catch (error) {
    if (error instanceof RefreshTokenReuseError) {
      throw error;
    }
    throw error;
  }
}

export function logout(
  sessionId: string | undefined,
  userId: string | undefined,
  rawRefreshToken: string | undefined,
  meta?: { requestId?: string; userAgent?: string }
): void {
  if (sessionId && userId) {
    revokeSession(sessionId, userId);
    disconnectSessionSockets(sessionId);
    logSecurityEvent({
      requestId: meta?.requestId,
      sessionId,
      actorUserId: userId,
      userAgent: meta?.userAgent,
      action: "LOGOUT",
      result: "SUCCESS",
      riskLevel: "INFO",
    });
    return;
  }

  if (rawRefreshToken) {
    const session = revokeSessionByRefreshToken(rawRefreshToken);
    if (session) {
      disconnectSessionSockets(session.id);
      logSecurityEvent({
        requestId: meta?.requestId,
        sessionId: session.id,
        actorUserId: session.user_id,
        userAgent: meta?.userAgent,
        action: "LOGOUT",
        result: "SUCCESS",
        riskLevel: "INFO",
      });
    }
  }
}

export function logoutAll(userId: string, exceptSessionId?: string): number {
  const count = revokeAllSessions(userId, exceptSessionId);
  return count;
}

function assertPasswordProvided(password: unknown): void {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required");
  }
}

export function getUser(userId: string): User | undefined {
  const row = db
    .prepare("SELECT id, username, email, created_at FROM users WHERE id = ?")
    .get(userId) as User | undefined;
  return row ? mapUser(row) : undefined;
}
