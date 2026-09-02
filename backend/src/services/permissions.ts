import { db } from "../db.js";
import { PERMISSION_CATALOG } from "../permissions/catalog.js";

export interface Permission {
  code: string;
  name: string;
  description: string;
  group: string;
}

export function seedPermissions(): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO permissions (code, name, description, permission_group)
    VALUES (?, ?, ?, ?)
  `);
  for (const p of PERMISSION_CATALOG) {
    insert.run(p.code, p.name, p.description, p.group);
  }
}

export function listPermissions(): Permission[] {
  const rows = db.prepare(`
    SELECT code, name, description, permission_group AS "group"
    FROM permissions ORDER BY permission_group, name
  `).all() as Permission[];
  return rows;
}

export function getPermissionsByRole(roleId: string): string[] {
  const rows = db.prepare(`
    SELECT permission_code FROM role_permissions WHERE role_id = ? ORDER BY permission_code
  `).all(roleId) as { permission_code: string }[];
  return rows.map((r) => r.permission_code);
}

export function setRolePermissions(roleId: string, codes: string[]): void {
  const valid = new Set(
    (db.prepare("SELECT code FROM permissions").all() as { code: string }[]).map((r) => r.code)
  );
  const filtered = [...new Set(codes.filter((c) => valid.has(c)))];

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(roleId);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES (?, ?)
    `);
    for (const code of filtered) insert.run(roleId, code);
  });
  tx();
}
