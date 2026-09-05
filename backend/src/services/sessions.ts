import crypto from "crypto";
import { db } from "../db.js";
import { signAccessToken } from "../middleware/auth.js";
import { logSecurityEvent } from "./securityEvents.js";
import { REFRESH_TTL_MS } from "../config/cookies.js";

const REFRESH_TOKEN_BYTES = 32;

export interface UserSession {
  id: string;
  user_id: string;
  refresh_token_hash: string | null;
  previous_refresh_token_hash: string | null;
  token_family_id: string | null;
  user_agent: string;
  source_ip: string | null;
  security_version: number;
  status: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AuthenticatedSessionResult {
  session: UserSession;
  /** Raw refresh token — set as HttpOnly cookie only; never serialize to JSON. */
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
}

export class RefreshTokenReuseError extends Error {
  constructor(message = "Refresh token reuse detected") {
    super(message);
    this.name = "RefreshTokenReuseError";
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

function getSessionById(sessionId: string): UserSession | undefined {
  return db.prepare("SELECT * FROM user_sessions WHERE id = ?").get(sessionId) as UserSession | undefined;
}

function sessionExpired(session: UserSession): boolean {
  return new Date(session.expires_at).getTime() < Date.now();
}

function markSessionExpired(sessionId: string): void {
  db.prepare(`
    UPDATE user_sessions SET status = 'expired' WHERE id = ? AND status = 'active'
  `).run(sessionId);
}

/** Create session with refresh token hash stored server-side; raw token returned for cookie only. */
export function createAuthenticatedSession(
  userId: string,
  userAgent = "",
  sourceIp?: string
): AuthenticatedSessionResult {
  const sessionId = crypto.randomUUID();
  const tokenFamilyId = crypto.randomUUID();
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();

  db.prepare(`
    INSERT INTO user_sessions (
      id, user_id, refresh_token_hash, token_family_id, user_agent, source_ip, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    userId,
    refreshTokenHash,
    tokenFamilyId,
    userAgent.slice(0, 512),
    sourceIp ?? null,
    expiresAt
  );

  const session = getSessionById(sessionId)!;
  const { accessToken, expiresIn } = signAccessToken(userId, sessionId);
  return { session, refreshToken, accessToken, expiresIn };
}

export function findSessionByRefreshToken(rawRefreshToken: string): UserSession | undefined {
  const hash = hashToken(rawRefreshToken);
  return db.prepare(`
    SELECT * FROM user_sessions WHERE refresh_token_hash = ? AND status = 'active'
  `).get(hash) as UserSession | undefined;
}

function findSessionByPreviousRefreshHash(hash: string): UserSession | undefined {
  return db.prepare(`
    SELECT * FROM user_sessions
    WHERE previous_refresh_token_hash = ? AND status IN ('active', 'revoked')
  `).get(hash) as UserSession | undefined;
}

function revokeTokenFamily(tokenFamilyId: string, reason: string): void {
  db.prepare(`
    UPDATE user_sessions
    SET status = 'revoked', revoked_at = datetime('now')
    WHERE token_family_id = ? AND status = 'active'
  `).run(tokenFamilyId);
  logSecurityEvent({
    action: "REFRESH_TOKEN_REUSE_DETECTED",
    result: "BLOCKED",
    reason,
    riskLevel: "HIGH",
    metadata: { token_family_id: tokenFamilyId },
  });
}

/** Rotate refresh token and issue new short-lived access token. */
export function rotateRefreshSession(
  rawRefreshToken: string,
  meta?: { userAgent?: string; ip?: string; requestId?: string }
): AuthenticatedSessionResult {
  const hash = hashToken(rawRefreshToken);

  const session = findSessionByRefreshToken(rawRefreshToken);
  if (!session) {
    const reuseCandidate = findSessionByPreviousRefreshHash(hash);
    if (reuseCandidate?.token_family_id) {
      revokeTokenFamily(reuseCandidate.token_family_id, "Presented previously rotated refresh token");
      throw new RefreshTokenReuseError();
    }

    logSecurityEvent({
      requestId: meta?.requestId,
      userAgent: meta?.userAgent,
      sourceIp: meta?.ip,
      action: "REFRESH_DENIED",
      result: "DENIED",
      reason: "Invalid refresh token",
      statusCode: 401,
      riskLevel: "MEDIUM",
    });
    throw new Error("Invalid refresh session");
  }

  if (sessionExpired(session)) {
    markSessionExpired(session.id);
    logSecurityEvent({
      requestId: meta?.requestId,
      sessionId: session.id,
      actorUserId: session.user_id,
      userAgent: meta?.userAgent,
      sourceIp: meta?.ip,
      action: "REFRESH_DENIED",
      result: "DENIED",
      reason: "Refresh session expired",
      statusCode: 401,
      riskLevel: "MEDIUM",
    });
    throw new Error("Refresh session expired");
  }

  const newRefreshToken = generateRefreshToken();
  const newHash = hashToken(newRefreshToken);

  const updated = db.prepare(`
    UPDATE user_sessions
    SET refresh_token_hash = ?,
        previous_refresh_token_hash = refresh_token_hash,
        last_seen_at = datetime('now'),
        user_agent = COALESCE(?, user_agent),
        source_ip = COALESCE(?, source_ip)
    WHERE id = ? AND refresh_token_hash = ? AND status = 'active'
  `).run(
    newHash,
    meta?.userAgent?.slice(0, 512) ?? null,
    meta?.ip ?? null,
    session.id,
    hash
  );

  if (updated.changes === 0) {
    throw new Error("Refresh session conflict");
  }

  const refreshed = getSessionById(session.id)!;
  const { accessToken, expiresIn } = signAccessToken(refreshed.user_id, refreshed.id);

  logSecurityEvent({
    requestId: meta?.requestId,
    sessionId: refreshed.id,
    actorUserId: refreshed.user_id,
    userAgent: meta?.userAgent,
    sourceIp: meta?.ip,
    action: "REFRESH_SUCCESS",
    result: "SUCCESS",
    riskLevel: "INFO",
  });

  return {
    session: refreshed,
    refreshToken: newRefreshToken,
    accessToken,
    expiresIn,
  };
}

/** @deprecated Use createAuthenticatedSession */
export function createSession(userId: string, userAgent = "", sourceIp?: string): UserSession {
  return createAuthenticatedSession(userId, userAgent, sourceIp).session;
}

export function validateSession(sessionId: string, userId: string): UserSession | null {
  const session = db.prepare(`
    SELECT * FROM user_sessions WHERE id = ? AND user_id = ?
  `).get(sessionId, userId) as UserSession | undefined;

  if (!session) return null;
  if (session.status !== "active") return null;
  if (sessionExpired(session)) {
    markSessionExpired(sessionId);
    return null;
  }
  return session;
}

export function touchSession(sessionId: string): void {
  db.prepare(`
    UPDATE user_sessions SET last_seen_at = datetime('now') WHERE id = ? AND status = 'active'
  `).run(sessionId);
}

export function revokeSession(sessionId: string, userId?: string): void {
  if (userId) {
    db.prepare(`
      UPDATE user_sessions SET status = 'revoked', revoked_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(sessionId, userId);
  } else {
    db.prepare(`
      UPDATE user_sessions SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?
    `).run(sessionId);
  }
}

export function revokeSessionByRefreshToken(rawRefreshToken: string): UserSession | null {
  const session = findSessionByRefreshToken(rawRefreshToken);
  if (!session) return null;
  revokeSession(session.id, session.user_id);
  return session;
}

export function revokeAllSessions(userId: string, exceptSessionId?: string): number {
  if (exceptSessionId) {
    const result = db.prepare(`
      UPDATE user_sessions SET status = 'revoked', revoked_at = datetime('now')
      WHERE user_id = ? AND status = 'active' AND id != ?
    `).run(userId, exceptSessionId);
    return result.changes;
  }
  const result = db.prepare(`
    UPDATE user_sessions SET status = 'revoked', revoked_at = datetime('now')
    WHERE user_id = ? AND status = 'active'
  `).run(userId);
  return result.changes;
}

export function listActiveSessions(userId: string): UserSession[] {
  return db.prepare(`
    SELECT * FROM user_sessions
    WHERE user_id = ? AND status = 'active' AND datetime(expires_at) > datetime('now')
    ORDER BY last_seen_at DESC
  `).all(userId) as UserSession[];
}
