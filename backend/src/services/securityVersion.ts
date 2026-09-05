import { db } from "../db.js";
import { emitSecurityChanged } from "../socket.js";

export function getMemberSecurityVersion(workspaceId: string, userId: string): number {
  const row = db.prepare(`
    SELECT security_version FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { security_version: number } | undefined;
  return row?.security_version ?? 0;
}

export function getMemberSecurityVersionById(memberId: string): number {
  const row = db.prepare(`
    SELECT security_version, workspace_id, user_id FROM workspace_members WHERE id = ?
  `).get(memberId) as { security_version: number; workspace_id: string; user_id: string } | undefined;
  return row?.security_version ?? 0;
}

/** Increment security version and notify connected clients. */
export function bumpMemberSecurityVersion(
  memberId: string,
  event: "permission.changed" | "role.changed" | "membership.changed" | "admin.authority.changed" | "workspace.access.revoked" = "permission.changed"
): number {
  const member = db.prepare(`
    SELECT id, workspace_id, user_id, security_version FROM workspace_members WHERE id = ?
  `).get(memberId) as { id: string; workspace_id: string; user_id: string; security_version: number } | undefined;

  if (!member) return 0;

  const nextVersion = (member.security_version ?? 1) + 1;
  db.prepare(`
    UPDATE workspace_members SET security_version = ? WHERE id = ?
  `).run(nextVersion, memberId);

  emitSecurityChanged(member.user_id, {
    workspaceId: member.workspace_id,
    securityVersion: nextVersion,
    event,
    changedAt: new Date().toISOString(),
  });

  return nextVersion;
}

export function bumpSecurityVersionForUserInWorkspace(
  workspaceId: string,
  userId: string,
  event: "permission.changed" | "role.changed" | "membership.changed" | "admin.authority.changed" | "workspace.access.revoked" = "permission.changed"
): number {
  const member = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { id: string } | undefined;
  if (!member) {
    if (event === "workspace.access.revoked") {
      emitSecurityChanged(userId, {
        workspaceId,
        securityVersion: 0,
        event,
        changedAt: new Date().toISOString(),
      });
    }
    return 0;
  }
  return bumpMemberSecurityVersion(member.id, event);
}

export function bumpSecurityVersionForRoleMembers(workspaceId: string, roleId: string): void {
  const members = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND role_id = ?
  `).all(workspaceId, roleId) as { id: string }[];

  for (const member of members) {
    bumpMemberSecurityVersion(member.id, "permission.changed");
  }
}
