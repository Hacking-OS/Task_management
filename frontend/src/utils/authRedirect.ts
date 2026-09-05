export const RETURN_URL_KEY = "auth_return_url";

const PUBLIC_PREFIXES = ["/login", "/invite/", "/join/", "/onboarding"];

export function saveReturnUrl(path: string): void {
  if (!path || path === "/") return;
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
  sessionStorage.setItem(RETURN_URL_KEY, path);
}

export function consumeReturnUrl(): string | null {
  const url = sessionStorage.getItem(RETURN_URL_KEY);
  sessionStorage.removeItem(RETURN_URL_KEY);
  return url;
}

/** Decide where to send the user immediately after login/register. */
export async function resolvePostAuthDestination(
  _token: string,
  joinedWorkspaceIds: string[] = []
): Promise<string> {
  const returnUrl = consumeReturnUrl();
  if (returnUrl) return returnUrl;

  if (joinedWorkspaceIds.length > 0) {
    return "/dashboard";
  }

  // Workspace membership is resolved once by WorkspaceProvider on mount.
  // Avoid a redundant GET /workspaces here (LoginPage → ProtectedRoutes duplicate).
  return "/dashboard";
}

/** Where authenticated users should go when hitting /login. */
export async function resolveAuthenticatedEntry(token: string): Promise<string> {
  return resolvePostAuthDestination(token);
}
