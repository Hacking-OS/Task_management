import type { CookieOptions, Request, Response } from "express";

export const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME ?? "refresh_token";
export const REFRESH_COOKIE_PATH = "/api/auth";
export const REFRESH_TTL_MS = Number(process.env.REFRESH_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);

const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
).split(",").map((o) => o.trim()).filter(Boolean);

export function getAllowedOrigins(): string[] {
  return ALLOWED_ORIGINS;
}

export function refreshCookieOptions(maxAgeMs = REFRESH_TTL_MS): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(res: Response, rawToken: string, maxAgeMs = REFRESH_TTL_MS): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, refreshCookieOptions(maxAgeMs));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...refreshCookieOptions(0),
    maxAge: 0,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Validate Origin/Referer for cookie-authenticated auth mutations (CSRF mitigation). */
export function validateAuthOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (origin) return ALLOWED_ORIGINS.includes(origin);

  const referer = req.headers.referer;
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return ALLOWED_ORIGINS.includes(refOrigin);
    } catch {
      return false;
    }
  }

  // Same-origin navigation or non-browser clients in dev/tests.
  return process.env.NODE_ENV !== "production";
}
