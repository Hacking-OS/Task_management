import { db } from "../db.js";
import { ALL_PERMISSION_CODES } from "../permissions/catalog.js";
import { getMemberOverrideSets } from "./memberPermissions.js";
import { isWorkspaceOwner } from "./authorization.js";

export type RolePermissionEffect = "allow" | "approval_required" | "deny";

export interface PermissionResolution {
  permission: string;
  allowed: boolean;
  requiresApproval: boolean;
  denied: boolean;
  canRequestApproval: boolean;
  reason: string;
}

export function approvalDecideCode(permissionCode: string): string {
  return `approval.decide.${permissionCode}`;
}

export function isApprovalDecideCode(code: string): boolean {
  return code === "approval.decide" || code.startsWith("approval.decide.");
}

export function getRolePermissionEffects(roleId: string): Map<string, RolePermissionEffect> {
  const rows = db.prepare(`
    SELECT permission_code, COALESCE(effect, 'allow') AS effect
    FROM role_permissions WHERE role_id = ?
  `).all(roleId) as { permission_code: string; effect: RolePermissionEffect }[];

  const map = new Map<string, RolePermissionEffect>();
  for (const row of rows) {
    map.set(row.permission_code, row.effect);
  }
  return map;
}

/** Deterministic permission resolution for a workspace member. */
export function resolvePermission(
  userId: string,
  workspaceId: string,
  permissionCode: string,
  member?: { id: string; role_id: string; role_slug: string }
): PermissionResolution {
  const denied: PermissionResolution = {
    permission: permissionCode,
    allowed: false,
    requiresApproval: false,
    denied: true,
    canRequestApproval: false,
    reason: "Permission denied",
  };

  if (!ALL_PERMISSION_CODES.includes(permissionCode)) {
    return { ...denied, reason: "Unknown permission" };
  }

  const membership =
    member ??
    (db.prepare(`
      SELECT m.id, m.role_id, r.slug AS role_slug
      FROM workspace_members m
      JOIN workspace_roles r ON r.id = m.role_id
      WHERE m.workspace_id = ? AND m.user_id = ?
    `).get(workspaceId, userId) as { id: string; role_id: string; role_slug: string } | undefined);

  if (!membership) {
    return { ...denied, reason: "Not a workspace member" };
  }

  if (membership.role_slug === "owner") {
    return {
      permission: permissionCode,
      allowed: true,
      requiresApproval: false,
      denied: false,
      canRequestApproval: false,
      reason: "Workspace owner",
    };
  }

  const { grants, denies } = getMemberOverrideSets(membership.id);
  if (denies.includes(permissionCode)) {
    return { ...denied, denied: true, reason: "Explicitly denied for user" };
  }

  const roleEffects = getRolePermissionEffects(membership.role_id);
  const roleEffect = roleEffects.get(permissionCode);

  if (grants.includes(permissionCode)) {
    return {
      permission: permissionCode,
      allowed: true,
      requiresApproval: false,
      denied: false,
      canRequestApproval: false,
      reason: "Granted by user override",
    };
  }

  if (roleEffect === "deny") {
    return { ...denied, denied: true, reason: "Denied by role" };
  }

  if (roleEffect === "approval_required") {
    return {
      permission: permissionCode,
      allowed: false,
      requiresApproval: true,
      denied: false,
      canRequestApproval: true,
      reason: "Approval required",
    };
  }

  if (roleEffect === "allow") {
    return {
      permission: permissionCode,
      allowed: true,
      requiresApproval: false,
      denied: false,
      canRequestApproval: false,
      reason: "Allowed by role",
    };
  }

  return { ...denied, reason: "Not granted by role" };
}

/** Whether user can approve permission requests for a given permission code. */
export function canDecideApproval(userId: string, workspaceId: string, permissionCode: string): boolean {
  if (isWorkspaceOwner(userId, workspaceId)) return true;

  const decideAll = resolveApprovalDecide(userId, workspaceId, "approval.decide");
  if (decideAll) return true;

  const category = permissionCode.split(".")[0];
  if (category && resolveApprovalDecide(userId, workspaceId, `approval.decide.${category}`)) {
    return true;
  }

  return resolveApprovalDecide(userId, workspaceId, approvalDecideCode(permissionCode));
}

function resolveApprovalDecide(userId: string, workspaceId: string, decideCode: string): boolean {
  const membership = db.prepare(`
    SELECT m.id, m.role_id, r.slug AS role_slug
    FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ? AND m.user_id = ?
  `).get(workspaceId, userId) as { id: string; role_id: string; role_slug: string } | undefined;

  if (!membership || membership.role_slug === "owner") return membership?.role_slug === "owner";

  const { grants, denies } = getMemberOverrideSets(membership.id);
  if (denies.includes(decideCode)) return false;
  if (grants.includes(decideCode)) return true;

  const rolePerms = getRolePermissionEffects(membership.role_id);
  const effect = rolePerms.get(decideCode);
  return effect === "allow";
}

export function getAllowedPermissions(userId: string, workspaceId: string): string[] {
  const membership = db.prepare(`
    SELECT m.id, m.role_id, r.slug AS role_slug
    FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ? AND m.user_id = ?
  `).get(workspaceId, userId) as { id: string; role_id: string; role_slug: string } | undefined;

  if (!membership) return [];
  if (membership.role_slug === "owner") return [...ALL_PERMISSION_CODES];

  const { grants, denies } = getMemberOverrideSets(membership.id);
  const roleEffects = getRolePermissionEffects(membership.role_id);
  const effective = new Set<string>();

  for (const [code, effect] of roleEffects) {
    if (effect === "allow" && ALL_PERMISSION_CODES.includes(code)) effective.add(code);
  }
  for (const code of grants) {
    if (ALL_PERMISSION_CODES.includes(code)) effective.add(code);
  }
  for (const code of denies) effective.delete(code);

  return Array.from(effective).sort();
}
