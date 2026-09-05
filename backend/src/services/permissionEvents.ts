import { db } from "../db.js";
import { PERMISSION_CATALOG } from "../permissions/catalog.js";
import { emitPermissionsUpdated } from "../socket.js";
import { getEffectivePermissions } from "./authorization.js";
import { notify } from "./notifications.js";
import { bumpMemberSecurityVersion, bumpSecurityVersionForUserInWorkspace } from "./securityVersion.js";

function permissionLabel(code: string): string {
  return PERMISSION_CATALOG.find((p) => p.code === code)?.name ?? code;
}

export function snapshotRoleMemberPermissions(workspaceId: string, roleId: string): Map<string, string[]> {
  const rows = db.prepare(`
    SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role_id = ?
  `).all(workspaceId, roleId) as { user_id: string }[];

  const map = new Map<string, string[]>();
  for (const row of rows) {
    map.set(row.user_id, getEffectivePermissions(row.user_id, workspaceId));
  }
  return map;
}

export function notifyPermissionDiff(
  workspaceId: string,
  memberUserId: string,
  before: string[],
  after: string[],
  actorUserId: string,
  event: "permission.changed" | "role.changed" | "admin.authority.changed" = "permission.changed"
): void {
  const member = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, memberUserId) as { id: string } | undefined;

  const securityVersion = member
    ? bumpMemberSecurityVersion(member.id, event)
    : bumpSecurityVersionForUserInWorkspace(workspaceId, memberUserId, event);

  if (memberUserId === actorUserId) {
    emitPermissionsUpdated(memberUserId, workspaceId, { permissions: after, securityVersion });
    return;
  }

  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const granted = after.filter((p) => !beforeSet.has(p));
  const revoked = before.filter((p) => !afterSet.has(p));

  for (const code of granted) {
    notify({
      userId: memberUserId,
      type: "success",
      title: "Permission granted",
      message: `You have been granted permission: ${permissionLabel(code)}.`,
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      metadata: { action: "permission_granted", permission_code: code },
    });
  }

  for (const code of revoked) {
    notify({
      userId: memberUserId,
      type: "warning",
      title: "Permission revoked",
      message: `Your permission has been revoked: ${permissionLabel(code)}.`,
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      metadata: { action: "permission_revoked", permission_code: code },
    });
  }

  emitPermissionsUpdated(memberUserId, workspaceId, { permissions: after, securityVersion });
}

export function syncMembersAfterRolePermissionChange(
  workspaceId: string,
  roleId: string,
  beforeByUser: Map<string, string[]>,
  actorUserId: string
): void {
  const rows = db.prepare(`
    SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role_id = ?
  `).all(workspaceId, roleId) as { user_id: string }[];

  for (const row of rows) {
    const after = getEffectivePermissions(row.user_id, workspaceId);
    const before = beforeByUser.get(row.user_id) ?? after;
    notifyPermissionDiff(workspaceId, row.user_id, before, after, actorUserId, "role.changed");
  }
}

export function syncMemberPermissionChange(
  workspaceId: string,
  memberUserId: string,
  before: string[],
  actorUserId: string
): void {
  const after = getEffectivePermissions(memberUserId, workspaceId);
  const approvalCodes = (codes: string[]) => codes.filter((c) => c.startsWith("approval.decide."));
  const event =
    JSON.stringify(approvalCodes(before).sort()) !== JSON.stringify(approvalCodes(after).sort())
      ? ("admin.authority.changed" as const)
      : ("permission.changed" as const);
  notifyPermissionDiff(workspaceId, memberUserId, before, after, actorUserId, event);
}
