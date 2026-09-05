import type { Workspace } from "../models/types";

/** Check a permission within a specific workspace's membership — not the active workspace. */
export function hasPermissionInWorkspace(workspace: Workspace | undefined, permission: string): boolean {
  return workspace?.my_membership?.permissions.includes(permission) ?? false;
}

export function workspaceRoleLabel(workspace: Workspace | undefined): string {
  if (!workspace?.my_membership) return "—";
  return workspace.my_membership.role_name;
}
