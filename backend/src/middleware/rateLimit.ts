import type { Request, Response, NextFunction } from "express";
import { logSecurityEvent } from "../services/securityEvents.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Test helper — clears in-memory rate-limit buckets. */
export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}

function keyFor(req: Request, namespace: string, scope: "ip" | "user" | "ip_user"): string {
  const ip = req.ip ?? "unknown";
  const user = req.userId ?? "anon";
  if (scope === "ip") return `${namespace}:ip:${ip}`;
  if (scope === "user") return `${namespace}:user:${user}`;
  return `${namespace}:${user}:${ip}`;
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function createRateLimit(options: {
  namespace: string;
  max: number;
  windowMs: number;
  scope?: "ip" | "user" | "ip_user";
  logAction?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.DISABLE_RATE_LIMIT === "1") {
      next();
      return;
    }
    const key = keyFor(req, options.namespace, options.scope ?? "ip_user");
    const result = checkRateLimit(key, options.max, options.windowMs);
    if (!result.allowed) {
      if (options.logAction) {
        logSecurityEvent({
          requestId: req.requestId,
          sessionId: req.sessionId,
          actorUserId: req.userId,
          userAgent: req.userAgent,
          sourceIp: req.ip,
          httpMethod: req.method,
          route: req.path,
          action: options.logAction,
          result: "BLOCKED",
          reason: "Rate limit exceeded",
          statusCode: 429,
          riskLevel: "MEDIUM",
          metadata: { namespace: options.namespace },
        });
      }
      res.setHeader("Retry-After", String(result.retryAfterSec));
      res.status(429).json({ error: "Too many requests. Please try again later.", requestId: req.requestId });
      return;
    }
    next();
  };
}

export const signupRateLimit = createRateLimit({
  namespace: "signup",
  max: 10,
  windowMs: 15 * 60 * 1000,
  scope: "ip",
  logAction: "RATE_LIMIT_TRIGGERED",
});

export const loginRateLimit = createRateLimit({
  namespace: "login",
  max: 20,
  windowMs: 15 * 60 * 1000,
  scope: "ip",
  logAction: "RATE_LIMIT_TRIGGERED",
});

/** @deprecated Use loginRateLimit or signupRateLimit */
export const authRateLimit = loginRateLimit;

export const approvalRateLimit = createRateLimit({
  namespace: "approval",
  max: 60,
  windowMs: 15 * 60 * 1000,
  scope: "user",
  logAction: "RATE_LIMIT_TRIGGERED",
});

export const inviteRateLimit = createRateLimit({
  namespace: "invite",
  max: 30,
  windowMs: 15 * 60 * 1000,
  scope: "user",
  logAction: "RATE_LIMIT_TRIGGERED",
});

export const teamJoinRateLimit = createRateLimit({
  namespace: "team_join",
  max: 20,
  windowMs: 15 * 60 * 1000,
  scope: "user",
  logAction: "RATE_LIMIT_TRIGGERED",
});

export const refreshRateLimit = createRateLimit({
  namespace: "refresh",
  max: 30,
  windowMs: 15 * 60 * 1000,
  scope: "ip",
  logAction: "RATE_LIMIT_TRIGGERED",
});

/** Default ip_user scope — exported for unit tests only. */
export const ipUserScopeRateLimitForTests = createRateLimit({
  namespace: "test_ip_user",
  max: 2,
  windowMs: 60_000,
  logAction: "RATE_LIMIT_TRIGGERED",
});

/** No security log — exported for unit tests only. */
export const noLogRateLimitForTests = createRateLimit({
  namespace: "test_no_log",
  max: 1,
  windowMs: 60_000,
  scope: "ip",
});
