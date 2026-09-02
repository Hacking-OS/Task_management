import { db } from "../db.js";
import {
  DEFAULT_ROLE_PERMISSIONS,
  LEGACY_ROLE_SLUG_MAP,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_SLUGS,
} from "../permissions/catalog.js";
import { getPermissionsByRole, setRolePermissions } from "./permissions.js";

export interface WorkspaceRole {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  is_system: number;
  created_at: string;
  updated_at: string;
}

export function seedDefaultRoles(workspaceId: string): Record<string, WorkspaceRole> {
  const roles: Record<string, WorkspaceRole> = {};
  for (const slug of SYSTEM_ROLE_SLUGS) {
    const existing = getRoleBySlug(workspaceId, slug);
    if (existing) {
      roles[slug] = existing;
      continue;
    }
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO workspace_roles (id, workspace_id, name, slug, is_system)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, workspaceId, SYSTEM_ROLE_NAMES[slug], slug);
    const role = db.prepare("SELECT * FROM workspace_roles WHERE id = ?").get(id) as WorkspaceRole;
    setRolePermissions(id, DEFAULT_ROLE_PERMISSIONS[slug] ?? []);
    roles[slug] = role;
  }
  return roles;
}

/** Backfill new system roles on existing workspaces. */
export function migrateMissingSystemRoles(): void {
  const workspaces = db.prepare("SELECT id FROM workspaces").all() as { id: string }[];
  for (const ws of workspaces) {
    seedDefaultRoles(ws.id);

    for (const [legacy, target] of Object.entries(LEGACY_ROLE_SLUG_MAP)) {
      const legacyRole = getRoleBySlug(ws.id, legacy);
      const targetRole = getRoleBySlug(ws.id, target);
      if (legacyRole && targetRole) {
        db.prepare("UPDATE workspace_members SET role_id = ? WHERE role_id = ?").run(targetRole.id, legacyRole.id);
      }
    }
  }
}

export function listRoles(workspaceId: string): WorkspaceRole[] {
  return db.prepare(`
    SELECT * FROM workspace_roles WHERE workspace_id = ? ORDER BY is_system DESC, name ASC
  `).all(workspaceId) as WorkspaceRole[];
}

export function getRole(workspaceId: string, roleId: string): WorkspaceRole | undefined {
  return db.prepare(`
    SELECT * FROM workspace_roles WHERE id = ? AND workspace_id = ?
  `).get(roleId, workspaceId) as WorkspaceRole | undefined;
}

export function getRoleBySlug(workspaceId: string, slug: string): WorkspaceRole | undefined {
  return db.prepare(`
    SELECT * FROM workspace_roles WHERE workspace_id = ? AND slug = ?
  `).get(workspaceId, slug) as WorkspaceRole | undefined;
}

export function createRole(workspaceId: string, name: string, permissionCodes: string[]): WorkspaceRole {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `role-${Date.now()}`;
  const existing = getRoleBySlug(workspaceId, slug);
  if (existing) throw new Error("A role with a similar name already exists");

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_roles (id, workspace_id, name, slug, is_system)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, workspaceId, name.trim(), slug);

  setRolePermissions(id, permissionCodes);
  return db.prepare("SELECT * FROM workspace_roles WHERE id = ?").get(id) as WorkspaceRole;
}

export function renameRole(workspaceId: string, roleId: string, name: string): WorkspaceRole {
  const role = getRole(workspaceId, roleId);
  if (!role) throw new Error("Role not found");
  if (role.is_system && role.slug === "owner") throw new Error("Cannot rename the Owner role");

  db.prepare(`
    UPDATE workspace_roles SET name = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name.trim(), roleId);

  return db.prepare("SELECT * FROM workspace_roles WHERE id = ?").get(roleId) as WorkspaceRole;
}

export function deleteRole(workspaceId: string, roleId: string): void {
  const role = getRole(workspaceId, roleId);
  if (!role) throw new Error("Role not found");
  if (role.is_system) throw new Error("System roles cannot be deleted");

  const members = db.prepare("SELECT COUNT(*) AS c FROM workspace_members WHERE role_id = ?").get(roleId) as { c: number };
  if (members.c > 0) throw new Error("Cannot delete a role assigned to members");

  db.prepare("DELETE FROM workspace_roles WHERE id = ?").run(roleId);
}

export function updateRolePermissions(workspaceId: string, roleId: string, codes: string[]): WorkspaceRole {
  const role = getRole(workspaceId, roleId);
  if (!role) throw new Error("Role not found");
  if (role.slug === "owner") throw new Error("Owner role permissions cannot be modified");

  setRolePermissions(roleId, codes);
  db.prepare("UPDATE workspace_roles SET updated_at = datetime('now') WHERE id = ?").run(roleId);
  return db.prepare("SELECT * FROM workspace_roles WHERE id = ?").get(roleId) as WorkspaceRole;
}

export function resetRolePermissions(workspaceId: string, roleId: string): WorkspaceRole {
  const role = getRole(workspaceId, roleId);
  if (!role) throw new Error("Role not found");
  if (!role.is_system) throw new Error("Only system roles can be reset to defaults");

  const defaults = DEFAULT_ROLE_PERMISSIONS[role.slug];
  if (!defaults) throw new Error("No default permissions for this role");

  setRolePermissions(roleId, defaults);
  db.prepare("UPDATE workspace_roles SET updated_at = datetime('now') WHERE id = ?").run(roleId);
  return db.prepare("SELECT * FROM workspace_roles WHERE id = ?").get(roleId) as WorkspaceRole;
}

export function cloneRole(workspaceId: string, roleId: string, newName: string): WorkspaceRole {
  const role = getRole(workspaceId, roleId);
  if (!role) throw new Error("Role not found");
  const perms = getPermissionsByRole(roleId);
  return createRole(workspaceId, newName, perms);
}

export function getRoleWithPermissions(workspaceId: string, roleId: string) {
  const role = getRole(workspaceId, roleId);
  if (!role) return undefined;
  return { ...role, permissions: getPermissionsByRole(roleId) };
}

export function listRolesWithPermissions(workspaceId: string) {
  return listRoles(workspaceId).map((role) => ({
    ...role,
    permissions: getPermissionsByRole(role.id),
  }));
}
