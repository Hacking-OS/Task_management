import { Response, NextFunction, Request } from "express";
import jwt from "jsonwebtoken";
import { validateSession, touchSession } from "../services/sessions.js";
import { logSecurityEvent } from "../services/securityEvents.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "jellyfish-dev-secret-change-in-production";
export const ACCESS_TOKEN_EXPIRES_IN_SEC = Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 900);

export function getJwtSecret(): string {
  if (process.env.NODE_ENV === "production" && JWT_SECRET === "jellyfish-dev-secret-change-in-production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return JWT_SECRET;
}

export interface TokenPayload {
  sub: string;
  sid?: string;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
    if (!payload?.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signAccessToken(userId: string, sessionId: string): { accessToken: string; expiresIn: number } {
  const expiresIn = ACCESS_TOKEN_EXPIRES_IN_SEC;
  const accessToken = jwt.sign({ sub: userId, sid: sessionId }, getJwtSecret(), { expiresIn });
  return { accessToken, expiresIn };
}

/** @deprecated Use signAccessToken */
export function signToken(userId: string, sessionId?: string): string {
  if (!sessionId) {
    return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC });
  }
  return signAccessToken(userId, sessionId).accessToken;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logSecurityEvent({
      requestId: req.requestId,
      userAgent: req.userAgent,
      sourceIp: req.ip,
      httpMethod: req.method,
      route: req.path,
      action: "AUTH_REQUIRED",
      result: "DENIED",
      reason: "Missing bearer token",
      statusCode: 401,
      riskLevel: "LOW",
    });
    res.status(401).json({ error: "Authentication required", requestId: req.requestId });
    return;
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) {
    logSecurityEvent({
      requestId: req.requestId,
      userAgent: req.userAgent,
      sourceIp: req.ip,
      httpMethod: req.method,
      route: req.path,
      action: "TOKEN_INVALID",
      result: "DENIED",
      reason: "Invalid or expired token",
      statusCode: 401,
      riskLevel: "MEDIUM",
    });
    res.status(401).json({ error: "Invalid or expired token", requestId: req.requestId });
    return;
  }

  if (!payload.sid) {
    logSecurityEvent({
      requestId: req.requestId,
      actorUserId: payload.sub,
      userAgent: req.userAgent,
      sourceIp: req.ip,
      httpMethod: req.method,
      route: req.path,
      action: "SESSION_REQUIRED",
      result: "DENIED",
      reason: "Token missing session id",
      statusCode: 401,
      riskLevel: "MEDIUM",
    });
    res.status(401).json({ error: "Session required. Please sign in again.", requestId: req.requestId });
    return;
  }

  const session = validateSession(payload.sid, payload.sub);
  if (!session) {
    logSecurityEvent({
      requestId: req.requestId,
      sessionId: payload.sid,
      actorUserId: payload.sub,
      userAgent: req.userAgent,
      sourceIp: req.ip,
      httpMethod: req.method,
      route: req.path,
      action: "REVOKED_SESSION_REQUEST",
      result: "DENIED",
      reason: "Session revoked or expired",
      statusCode: 401,
      riskLevel: "HIGH",
    });
    res.status(401).json({ error: "Session expired or revoked", requestId: req.requestId });
    return;
  }
  req.sessionId = payload.sid;
  touchSession(payload.sid);

  req.userId = payload.sub;
  next();
}
