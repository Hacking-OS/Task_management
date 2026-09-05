import { Router } from "express";
import * as authService from "../services/auth.js";
import { authMiddleware, verifyToken } from "../middleware/auth.js";
import { loginRateLimit, signupRateLimit, refreshRateLimit } from "../middleware/rateLimit.js";
import { listActiveSessions } from "../services/sessions.js";
import { ValidationError } from "../validation/errors.js";
import {
  validateEmail,
  validateLoginIdentifier,
  validatePassword,
  validateUsername,
} from "../validation/common.js";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  validateAuthOrigin,
  REFRESH_TTL_MS,
} from "../config/cookies.js";
import { RefreshTokenReuseError } from "../services/sessions.js";
import { logSecurityEvent } from "../services/securityEvents.js";

const router = Router();

function handleAuthError(res: import("express").Response, error: unknown, req?: import("express").Request): void {
  const message = error instanceof Error ? error.message : "Request failed";
  let status = 400;
  if (error instanceof ValidationError) status = 400;
  else if (error instanceof RefreshTokenReuseError) status = 401;
  else if (message.includes("Invalid") || message.includes("expired") || message.includes("denied")) status = 401;
  res.status(status).json({ error: message, requestId: req?.requestId });
}

function publicAuthPayload(result: authService.AuthSessionPayload | authService.RegisterResult) {
  const base = {
    user: result.user,
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
  };
  if ("joined_workspace_ids" in result) {
    return { ...base, joined_workspace_ids: result.joined_workspace_ids };
  }
  return base;
}

function rejectAuthOrigin(req: import("express").Request, res: import("express").Response): boolean {
  if (validateAuthOrigin(req)) return false;
  logSecurityEvent({
    requestId: req.requestId,
    userAgent: req.userAgent,
    sourceIp: req.ip,
    httpMethod: req.method,
    route: req.path,
    action: "CSRF_ORIGIN_DENIED",
    result: "DENIED",
    reason: "Untrusted Origin",
    statusCode: 403,
    riskLevel: "HIGH",
  });
  res.status(403).json({ error: "Forbidden", requestId: req.requestId });
  return true;
}

router.post("/register", signupRateLimit, (req, res) => {
  try {
    const username = validateUsername(req.body.username);
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const inviteToken = typeof req.body.invite_token === "string" ? req.body.invite_token : undefined;
    const result = authService.register(username, email, password, inviteToken, {
      userAgent: req.userAgent,
      ip: req.ip,
      requestId: req.requestId,
    });
    setRefreshCookie(res, result.refreshToken, REFRESH_TTL_MS);
    res.status(201).json(publicAuthPayload(result));
  } catch (error) {
    handleAuthError(res, error, req);
  }
});

router.post("/login", loginRateLimit, (req, res) => {
  try {
    const identifier = validateLoginIdentifier(req.body.username ?? req.body.identifier ?? req.body.email);
    const password = req.body.password;
    if (typeof password !== "string" || !password) {
      res.status(400).json({ error: "Password is required", requestId: req.requestId });
      return;
    }
    const result = authService.login(identifier, password, {
      userAgent: req.userAgent,
      ip: req.ip,
      requestId: req.requestId,
    });
    setRefreshCookie(res, result.refreshToken, REFRESH_TTL_MS);
    res.json(publicAuthPayload(result));
  } catch (error) {
    handleAuthError(res, error, req);
  }
});

router.post("/refresh", refreshRateLimit, (req, res) => {
  if (rejectAuthOrigin(req, res)) return;

  const rawRefresh = readRefreshCookie(req);
  if (!rawRefresh) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Refresh session required", requestId: req.requestId });
    return;
  }

  try {
    const result = authService.refreshSession(rawRefresh, {
      userAgent: req.userAgent,
      ip: req.ip,
      requestId: req.requestId,
    });
    setRefreshCookie(res, result.refreshToken, REFRESH_TTL_MS);
    res.json(publicAuthPayload(result));
  } catch (error) {
    clearRefreshCookie(res);
    if (error instanceof RefreshTokenReuseError) {
      logSecurityEvent({
        requestId: req.requestId,
        userAgent: req.userAgent,
        sourceIp: req.ip,
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        result: "BLOCKED",
        reason: error.message,
        statusCode: 401,
        riskLevel: "HIGH",
      });
    }
    handleAuthError(res, error, req);
  }
});

router.post("/logout", (req, res) => {
  if (rejectAuthOrigin(req, res)) return;

  const rawRefresh = readRefreshCookie(req);
  let sessionId: string | undefined;
  let userId: string | undefined;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyToken(header.slice(7));
    if (payload?.sid) {
      sessionId = payload.sid;
      userId = payload.sub;
    }
  }

  authService.logout(sessionId, userId, rawRefresh, {
    requestId: req.requestId,
    userAgent: req.userAgent,
  });
  clearRefreshCookie(res);
  res.status(204).send();
});

router.post("/logout-all", authMiddleware, (req, res) => {
  if (rejectAuthOrigin(req, res)) return;
  authService.logoutAll(req.userId!, req.sessionId);
  clearRefreshCookie(res);
  res.status(204).send();
});

router.get("/sessions", authMiddleware, (req, res) => {
  try {
    const sessions = listActiveSessions(req.userId!).map((s) => ({
      id: s.id,
      user_agent: s.user_agent,
      created_at: s.created_at,
      last_seen_at: s.last_seen_at,
      expires_at: s.expires_at,
      is_current: s.id === req.sessionId,
    }));
    res.json({ sessions });
  } catch (error) {
    handleAuthError(res, error, req);
  }
});

export default router;
