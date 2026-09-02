/** Backend origin for Socket.IO (dev connects directly to avoid Vite ws proxy issues). */
export function getBackendOrigin(): string {
  const fromEnv = import.meta.env.VITE_BACKEND_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:4000";
  return window.location.origin;
}
