/** In-memory access token — never persisted to localStorage/sessionStorage. */
let accessToken: string | null = null;

let tokenRefreshHandler: ((token: string) => void) | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setTokenRefreshHandler(handler: ((token: string) => void) | null): void {
  tokenRefreshHandler = handler;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function notifyTokenRefreshed(token: string): void {
  accessToken = token;
  tokenRefreshHandler?.(token);
}

export function notifySessionExpired(): void {
  accessToken = null;
  sessionExpiredHandler?.();
}

export function clearAccessToken(): void {
  accessToken = null;
}
