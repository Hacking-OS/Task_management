import type { MemberWithDetails } from "./authorization.js";
import { isWorkspaceOwner } from "./authorization.js";
import type { WorkspaceRole } from "./workspaceRoles.js";

export type PermissionVisibility = {
  permissions_hidden?: boolean;
};

export type MemberWithVisibility = MemberWithDetails & PermissionVisibility;

export type RoleWithPermissions = WorkspaceRole & {
  permissions?: string[];
  permissions_hidden?: boolean;
};

/** Hide workspace owner permission details from everyone except the owner themselves or the workspace owner managing members. */
export function sanitizeMemberForViewer(
  member: MemberWithDetails,
  viewerUserId: string,
  workspaceId: string
): MemberWithVisibility {
  if (member.role_slug !== "owner") return member;
  if (member.user_id === viewerUserId) return member;
  if (isWorkspaceOwner(viewerUserId, workspaceId)) return member;
  return {
    ...member,
    role_permissions: undefined,
    permission_overrides: undefined,
    effective_permissions: undefined,
    permissions_hidden: true,
  };
}

export function sanitizeRoleForViewer(
  role: RoleWithPermissions,
  viewerUserId: string,
  workspaceId: string
): RoleWithPermissions {
  if (role.slug !== "owner") return role;
  if (isWorkspaceOwner(viewerUserId, workspaceId)) return role;
  return {
    ...role,
    permissions: undefined,
    permissions_hidden: true,
  };
}

export function sanitizeRolesForViewer(
  roles: RoleWithPermissions[],
  viewerUserId: string,
  workspaceId: string
): RoleWithPermissions[] {
  return roles.map((role) => sanitizeRoleForViewer(role, viewerUserId, workspaceId));
}
