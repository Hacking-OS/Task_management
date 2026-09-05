/** In-flight GET deduplication — concurrent identical requests share one Promise. */
const inflight = new Map<string, Promise<unknown>>();

export function dedupeInFlight<T>(key: string, execute: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = execute().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export function requestKey(method: string, path: string, token?: string): string {
  return `${method}:${path}:${token ?? ""}`;
}

/** Workspace-scoped generation — ignore stale responses after workspace switch. */
let workspaceGeneration = 0;

export function bumpWorkspaceGeneration(): number {
  workspaceGeneration += 1;
  return workspaceGeneration;
}

export function getWorkspaceGeneration(): number {
  return workspaceGeneration;
}

export function isStaleWorkspaceGeneration(generation: number): boolean {
  return generation !== workspaceGeneration;
}
