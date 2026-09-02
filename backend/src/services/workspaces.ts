import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { validateDescription, validateWorkspaceName } from "../validation/common.js";
import type { Workspace } from "../types.js";
import {
  addMember,
  getEffectivePermissions,
  isWorkspaceMember,
  listAccessibleWorkspaceIds,
  requireMembership,
  requirePermission,
} from "./authorization.js";
import { seedDefaultRoles } from "./workspaceRoles.js";
import { seedDefaultStatuses } from "./workspaceStatuses.js";
import { getWorkspaceStorageDir, removeWorkspaceStorageDir } from "./workspacePaths.js";

export function listWorkspaces(userId: string): Workspace[] {
  return db.prepare(`
    SELECT w.* FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ?
    ORDER BY w.updated_at DESC
  `).all(userId) as Workspace[];
}

export function getActiveWorkspace(userId: string): Workspace | undefined {
  return db.prepare(`
    SELECT w.* FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ? AND w.is_active = 1
    LIMIT 1
  `).get(userId) as Workspace | undefined;
}

export function getWorkspace(userId: string, workspaceId: string): Workspace | undefined {
  requirePermission(userId, workspaceId, "workspace.view");
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Workspace | undefined;
}

export function createWorkspace(userId: string, name: string, description = ""): Workspace {
  const validName = validateWorkspaceName(name);
  const validDescription = validateDescription(description);

  const id = crypto.randomUUID();
  getWorkspaceStorageDir(id);

  db.prepare(
    "INSERT INTO workspaces (id, user_id, name, description, is_active) VALUES (?, ?, ?, ?, 1)"
  ).run(id, userId, validName, validDescription);

  db.prepare("UPDATE workspaces SET is_active = 0 WHERE user_id = ? AND id != ?").run(userId, id);

  const roles = seedDefaultRoles(id);
  addMember(id, userId, roles.owner.id);
  seedDefaultStatuses(id);

  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace;
  ActivityLogger.log({
    userId,
    workspaceId: ws.id,
    entityType: "workspace",
    entityId: ws.id,
    action: "created",
    description: `Workspace "${validName}" was created`,
  });
  notify({
    userId,
    type: "workspace",
    title: "Workspace created",
    message: `"${validName}" is ready to use.`,
    workspaceId: ws.id,
    entityType: "workspace",
    entityId: ws.id,
  });
  return ws;
}

export function activateWorkspace(userId: string, workspaceId: string): Workspace {
  requireMembership(userId, workspaceId);
  db.prepare(`
    UPDATE workspaces SET is_active = 0
    WHERE id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)
  `).run(userId);
  db.prepare("UPDATE workspaces SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(workspaceId);

  const active = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Workspace;
  ActivityLogger.log({
    userId,
    workspaceId: active.id,
    entityType: "workspace",
    entityId: active.id,
    action: "activated",
    description: `Activated workspace "${active.name}"`,
  });
  return active;
}

export function updateWorkspace(
  userId: string,
  workspaceId: string,
  updates: { name?: string; description?: string }
): Workspace {
  requirePermission(userId, workspaceId, "workspace.edit");
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Workspace;

  db.prepare(
    "UPDATE workspaces SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(updates.name ?? ws.name, updates.description ?? ws.description, workspaceId);

  const updated = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Workspace;
  ActivityLogger.log({
    userId,
    workspaceId,
    entityType: "workspace",
    entityId: workspaceId,
    action: "updated",
    description: `Workspace "${updated.name}" was updated`,
  });
  return updated;
}

export function deleteWorkspace(userId: string, workspaceId: string): void {
  requirePermission(userId, workspaceId, "workspace.delete");
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Workspace;

  db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
  removeWorkspaceStorageDir(workspaceId);

  ActivityLogger.log({
    userId,
    workspaceId,
    entityType: "workspace",
    entityId: workspaceId,
    action: "deleted",
    description: `Workspace "${ws.name}" was removed`,
  });
}

export function getWorkspacePermissions(userId: string, workspaceId: string): string[] {
  if (!isWorkspaceMember(userId, workspaceId)) return [];
  return getEffectivePermissions(userId, workspaceId);
}

export { listAccessibleWorkspaceIds, isWorkspaceMember };
