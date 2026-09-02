import { db } from "../db.js";
import { ALL_PERMISSION_CODES } from "../permissions/catalog.js";
import { getPermissionsByRole } from "./permissions.js";
import { ForbiddenError } from "./authorization.js";

export type PermissionEffect = "grant" | "deny";

export interface MemberPermissionOverride {
  permission_code: string;
  effect: PermissionEffect;
}

export function getMemberPermissionOverrides(memberId: string): MemberPermissionOverride[] {
  return db.prepare(`
    SELECT permission_code, effect FROM workspace_member_permissions
    WHERE member_id = ? ORDER BY permission_code
  `).all(memberId) as MemberPermissionOverride[];
}

export function getMemberOverrideSets(memberId: string): { grants: string[]; denies: string[] } {
  const rows = getMemberPermissionOverrides(memberId);
  return {
    grants: rows.filter((r) => r.effect === "grant").map((r) => r.permission_code),
    denies: rows.filter((r) => r.effect === "deny").map((r) => r.permission_code),
  };
}

export function computeEffectivePermissions(roleId: string, memberId: string, roleSlug?: string): string[] {
  if (roleSlug === "owner") return [...ALL_PERMISSION_CODES];

  const effective = new Set(getPermissionsByRole(roleId));
  const { grants, denies } = getMemberOverrideSets(memberId);
  for (const code of grants) effective.add(code);
  for (const code of denies) effective.delete(code);
  return Array.from(effective).sort();
}

export function setMemberPermissionOverrides(
  workspaceId: string,
  memberId: string,
  overrides: MemberPermissionOverride[]
): { grants: string[]; denies: string[] } {
  const member = db.prepare(`
    SELECT m.*, r.slug AS role_slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.id = ? AND m.workspace_id = ?
  `).get(memberId, workspaceId) as { id: string; role_slug: string } | undefined;

  if (!member) throw new Error("Member not found");
  if (member.role_slug === "owner") {
    throw new ForbiddenError("Owner permissions cannot be customized");
  }

  const valid = new Set(ALL_PERMISSION_CODES);
  const normalized = overrides.filter((o) => valid.has(o.permission_code) && (o.effect === "grant" || o.effect === "deny"));

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM workspace_member_permissions WHERE member_id = ?").run(memberId);
    const insert = db.prepare(`
      INSERT INTO workspace_member_permissions (member_id, permission_code, effect)
      VALUES (?, ?, ?)
    `);
    for (const o of normalized) insert.run(memberId, o.permission_code, o.effect);
  });
  tx();

  return getMemberOverrideSets(memberId);
}

export function clearMemberPermissionOverrides(memberId: string): void {
  db.prepare("DELETE FROM workspace_member_permissions WHERE member_id = ?").run(memberId);
}
