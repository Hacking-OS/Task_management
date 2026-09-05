import request from "supertest";
import { createApp } from "../../src/app.js";
import { REFRESH_COOKIE_NAME } from "../../src/config/cookies.js";

export function createApiAgent() {
  const app = createApp();
  return request(app);
}

export function extractRefreshCookie(res: request.Response): string | undefined {
  const cookies = res.headers["set-cookie"];
  if (!cookies) return undefined;
  const list = Array.isArray(cookies) ? cookies : [cookies];
  for (const raw of list) {
    if (raw.startsWith(`${REFRESH_COOKIE_NAME}=`)) {
      return raw.split(";")[0].split("=")[1];
    }
  }
  return undefined;
}

export function cookieHeader(token: string): string {
  return `${REFRESH_COOKIE_NAME}=${token}`;
}

export function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}
