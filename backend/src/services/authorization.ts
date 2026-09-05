import { db } from "../db.js";
import type { User } from "../types.js";
import { avatarUrlForUser } from "./files.js";
import { getPermissionsByRole } from "./permissions.js";
import { getRole, getRoleBySlug, seedDefaultRoles } from "./workspaceRoles.js";
import { computeEffectivePermissions, getMemberOverrideSets } from "./memberPermissions.js";
import { sanitizeMemberForViewer } from "./permissionVisibility.js";
import { resolvePermission, approvalDecideCode, getRolePermissionEffects } from "./permissionResolver.js";
import { getMemberSecurityVersion, bumpSecurityVersionForUserInWorkspace } from "./securityVersion.js";

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class PermissionDeniedError extends ForbiddenError {
  permission: string;
  workspaceId: string | null;
  requiresApproval: boolean;

  constructor(permission: string, workspaceId: string | null, requiresApproval = false) {
    super(requiresApproval ? `Approval required: ${permission}` : `Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
    this.workspaceId = workspaceId;
    this.requiresApproval = requiresApproval;
  }
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role_id: string;
  joined_at: string;
}

export interface MemberWithDetails extends WorkspaceMember {
  username: string;
  email: string;
  role_name: string;
  role_slug: string;
  avatar_url: string | null;
  role_permissions?: string[];
  permission_overrides?: { grants: string[]; denies: string[] };
  effective_permissions?: string[];
  permissions_hidden?: boolean;
}

export function getMembership(userId: string, workspaceId: string): WorkspaceMember | undefined {
  return db.prepare(`
    SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as WorkspaceMember | undefined;
}

export function isWorkspaceMember(userId: string, workspaceId: string): boolean {
  return !!getMembership(userId, workspaceId);
}

export function getEffectivePermissions(userId: string, workspaceId: string): string[] {
  const membership = db.prepare(`
    SELECT m.*, r.slug AS role_slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ? AND m.user_id = ?
  `).get(workspaceId, userId) as (WorkspaceMember & { role_slug: string }) | undefined;
  if (!membership) return [];
  return computeEffectivePermissions(membership.role_id, membership.id, membership.role_slug);
}

export function hasPermission(userId: string, workspaceId: string, permission: string): boolean {
  return resolvePermission(userId, workspaceId, permission).allowed;
}

export function getPermissionResolution(userId: string, workspaceId: string, permission: string) {
  return resolvePermission(userId, workspaceId, permission);
}

export { resolvePermission, approvalDecideCode, getRolePermissionEffects };

export function requirePermission(userId: string, workspaceId: string | null | undefined, permission: string): void {
  if (!workspaceId) throw new ForbiddenError("Workspace context required");
  const resolution = resolvePermission(userId, workspaceId, permission);
  if (resolution.allowed) return;
  if (resolution.requiresApproval) {
    throw new PermissionDeniedError(permission, workspaceId, true);
  }
  throw new PermissionDeniedError(permission, workspaceId, false);
}

export function requireMembership(userId: string, workspaceId: string): WorkspaceMember {
  const membership = getMembership(userId, workspaceId);
  if (!membership) throw new ForbiddenError("Not a workspace member");
  return membership;
}

export function addMember(workspaceId: string, userId: string, roleId: string): WorkspaceMember {
  const existing = getMembership(userId, workspaceId);
  if (existing) throw new Error("User is already a workspace member");

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role_id)
    VALUES (?, ?, ?, ?)
  `).run(id, workspaceId, userId, roleId);
  return db.prepare("SELECT * FROM workspace_members WHERE id = ?").get(id) as WorkspaceMember;
}

export function listMembers(workspaceId: string, viewerUserId?: string): MemberWithDetails[] {
  const rows = db.prepare(`
    SELECT m.*, u.username, u.email, r.name AS role_name, r.slug AS role_slug
    FROM workspace_members m
    JOIN users u ON u.id = m.user_id
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ?
    ORDER BY r.is_system DESC, u.username ASC
  `).all(workspaceId) as Omit<MemberWithDetails, "avatar_url">[];

  return rows.map((m) => {
    const role_permissions = getPermissionsByRole(m.role_id);
    const permission_overrides = getMemberOverrideSets(m.id);
    const effective_permissions = computeEffectivePermissions(m.role_id, m.id, m.role_slug);
    const member: MemberWithDetails = {
      ...m,
      avatar_url: avatarUrlForUser(m.user_id),
      role_permissions,
      permission_overrides,
      effective_permissions,
    };
    return viewerUserId ? sanitizeMemberForViewer(member, viewerUserId, workspaceId) : member;
  });
}

export function changeMemberRole(
  workspaceId: string,
  memberId: string,
  newRoleId: string,
  actorUserId: string
): MemberWithDetails {
  const member = db.prepare(`
    SELECT m.*, r.slug AS role_slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.id = ? AND m.workspace_id = ?
  `).get(memberId, workspaceId) as (WorkspaceMember & { role_slug: string }) | undefined;

  if (!member) throw new Error("Member not found");

  const newRole = getRole(workspaceId, newRoleId);
  if (!newRole) throw new Error("Role not found");

  if (member.role_slug === "owner" && member.user_id !== actorUserId) {
    throw new ForbiddenError("Cannot change the workspace owner's role");
  }
  if (newRole.slug === "owner") {
    throw new ForbiddenError("Cannot assign Owner role directly");
  }

  db.prepare("UPDATE workspace_members SET role_id = ? WHERE id = ?").run(newRoleId, memberId);
  return listMembers(workspaceId).find((m) => m.id === memberId)!;
}

export function removeMember(workspaceId: string, memberId: string, actorUserId: string): void {
  const member = db.prepare(`
    SELECT m.*, r.slug AS role_slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.id = ? AND m.workspace_id = ?
  `).get(memberId, workspaceId) as (WorkspaceMember & { role_slug: string }) | undefined;

  if (!member) throw new Error("Member not found");
  if (member.role_slug === "owner") throw new ForbiddenError("Cannot remove the workspace owner");
  if (member.user_id === actorUserId) throw new ForbiddenError("Cannot remove yourself");

  db.prepare("DELETE FROM workspace_members WHERE id = ?").run(memberId);
  bumpSecurityVersionForUserInWorkspace(workspaceId, member.user_id, "workspace.access.revoked");
}

export function getMemberEffectivePermissions(workspaceId: string, memberId: string): string[] {
  const member = db.prepare(`
    SELECT m.*, r.slug AS role_slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.id = ? AND m.workspace_id = ?
  `).get(memberId, workspaceId) as (WorkspaceMember & { role_slug: string }) | undefined;
  if (!member) throw new Error("Member not found");
  return computeEffectivePermissions(member.role_id, member.id, member.role_slug);
}

export function isWorkspaceOwner(userId: string, workspaceId: string): boolean {
  const row = db.prepare(`
    SELECT r.slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ? AND m.user_id = ?
  `).get(workspaceId, userId) as { slug: string } | undefined;
  return row?.slug === "owner";
}

export function requireWorkspaceOwner(userId: string, workspaceId: string): void {
  if (!isWorkspaceOwner(userId, workspaceId)) {
    throw new ForbiddenError("Only the workspace owner can manage permissions");
  }
}

export function listAccessibleWorkspaceIds(userId: string): string[] {
  const rows = db.prepare(`
    SELECT workspace_id FROM workspace_members WHERE user_id = ?
  `).all(userId) as { workspace_id: string }[];
  return rows.map((r) => r.workspace_id);
}

export function listWorkspaceIdsWithPermission(userId: string, permissionCode: string): string[] {
  return listAccessibleWorkspaceIds(userId).filter((workspaceId) =>
    hasPermission(userId, workspaceId, permissionCode)
  );
}

export function setUserActiveWorkspace(userId: string, workspaceId: string): void {
  db.prepare(`
    INSERT INTO user_workspace_preferences (user_id, active_workspace_id, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      active_workspace_id = excluded.active_workspace_id,
      updated_at = datetime('now')
  `).run(userId, workspaceId);
}

export function getUserActiveWorkspaceId(userId: string): string | undefined {
  const row = db.prepare(`
    SELECT p.active_workspace_id AS workspace_id
    FROM user_workspace_preferences p
    JOIN workspace_members m ON m.workspace_id = p.active_workspace_id AND m.user_id = p.user_id
    WHERE p.user_id = ?
  `).get(userId) as { workspace_id: string } | undefined;
  return row?.workspace_id;
}

export function migrateLegacyWorkspaces(): void {
  const workspaces = db.prepare("SELECT id, user_id FROM workspaces").all() as { id: string; user_id: string }[];
  for (const ws of workspaces) {
    const roleCount = db.prepare("SELECT COUNT(*) AS c FROM workspace_roles WHERE workspace_id = ?").get(ws.id) as { c: number };
    if (roleCount.c > 0) continue;

    const roles = seedDefaultRoles(ws.id);
    addMember(ws.id, ws.user_id, roles.owner.id);
  }
}

export function findUserByEmail(email: string): User | undefined {
  return db.prepare("SELECT id, username, email, created_at FROM users WHERE email = ?").get(email) as User | undefined;
}

export function getOwnerRoleId(workspaceId: string): string {
  const role = getRoleBySlug(workspaceId, "owner");
  if (!role) throw new Error("Owner role not found");
  return role.id;
}

/** Workspace creator = original owner who created the workspace. */
export function isWorkspaceCreator(userId: string, workspaceId: string): boolean {
  const ws = db.prepare("SELECT user_id FROM workspaces WHERE id = ?").get(workspaceId) as { user_id: string } | undefined;
  if (!ws || ws.user_id !== userId) return false;
  return true;
}

export function requireWorkspaceCreator(userId: string, workspaceId: string): void {
  if (!isWorkspaceCreator(userId, workspaceId)) {
    throw new ForbiddenError("Only the workspace creator can perform this action");
  }
}

export function getMemberContext(userId: string, workspaceId: string) {
  const ws = db.prepare("SELECT user_id FROM workspaces WHERE id = ?").get(workspaceId) as { user_id: string } | undefined;
  const membership = db.prepare(`
    SELECT m.*, r.name AS role_name, r.slug AS role_slug
    FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ? AND m.user_id = ?
  `).get(workspaceId, userId) as (WorkspaceMember & { role_name: string; role_slug: string }) | undefined;

  const permissions = membership
    ? computeEffectivePermissions(membership.role_id, membership.id, membership.role_slug)
    : [];

  const security_version = membership
    ? getMemberSecurityVersion(workspaceId, userId)
    : 0;

  const approval_decide_permissions = membership
    ? permissions.filter((p) => p.startsWith("approval.decide"))
    : [];

  return {
    is_member: !!membership,
    is_creator: !!ws && ws.user_id === userId,
    is_owner: membership?.role_slug === "owner",
    role_slug: membership?.role_slug ?? null,
    role_name: membership?.role_name ?? null,
    permissions,
    security_version,
    approval_decide_permissions,
  };
}
