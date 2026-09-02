/** Normalize Express route params to a single string. */
export function paramString(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value[0] : value;
}

export function workspaceIdParam(params: Record<string, string | string[] | undefined>): string {
  return paramString(params.workspaceId);
}
