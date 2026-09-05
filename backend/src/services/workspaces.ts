import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { validateDescription, validateWorkspaceName } from "../validation/common.js";
import type { Workspace } from "../types.js";
import {
  addMember,
  getEffectivePermissions,
  getMemberContext,
  getUserActiveWorkspaceId,
  isWorkspaceMember,
  listAccessibleWorkspaceIds,
  requireMembership,
  requirePermission,
  setUserActiveWorkspace,
} from "./authorization.js";
import { seedDefaultRoles } from "./workspaceRoles.js";
import { seedDefaultStatuses } from "./workspaceStatuses.js";
import { getWorkspaceStorageDir, removeWorkspaceStorageDir } from "./workspacePaths.js";
import { isApprovalFlowsEnabled, setApprovalFlowsEnabled } from "./approvalFlows.js";

export function listWorkspaces(userId: string): Workspace[] {
  return db.prepare(`
    SELECT w.* FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ?
    ORDER BY w.updated_at DESC
  `).all(userId) as Workspace[];
}

export interface WorkspaceMembershipSummary {
  role_name: string;
  role_slug: string;
  permissions: string[];
  permission_count: number;
  is_owner: boolean;
  is_creator: boolean;
}

export type WorkspaceWithMembership = Workspace & {
  my_membership: WorkspaceMembershipSummary;
  owner_username?: string;
  member_count?: number;
  is_active_for_user?: boolean;
};

export function listWorkspacesWithMembership(userId: string): WorkspaceWithMembership[] {
  const activeId = getUserActiveWorkspaceId(userId);

  return listWorkspaces(userId).map((ws) => {
    const ctx = getMemberContext(userId, ws.id);
    const owner = db.prepare(`
      SELECT u.username FROM workspace_members m
      JOIN workspace_roles r ON r.id = m.role_id
      JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ? AND r.slug = 'owner'
      LIMIT 1
    `).get(ws.id) as { username: string } | undefined;

    const memberCount = db.prepare(`
      SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ?
    `).get(ws.id) as { c: number };

    return {
      ...ws,
      owner_username: owner?.username,
      member_count: memberCount.c,
      is_active_for_user: ws.id === activeId,
      my_membership: {
        role_name: ctx.role_name ?? "Member",
        role_slug: ctx.role_slug ?? "member",
        permissions: ctx.permissions,
        permission_count: ctx.permissions.length,
        is_owner: ctx.is_owner,
        is_creator: ctx.is_creator,
      },
    };
  });
}

export function getActiveWorkspace(userId: string): Workspace | undefined {
  const activeId = getUserActiveWorkspaceId(userId);
  if (activeId) {
    const ws = db.prepare(`
      SELECT w.* FROM workspaces w
      JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
      WHERE w.id = ?
    `).get(userId, activeId) as Workspace | undefined;
    if (ws) return ws;
  }

  const fallback = db.prepare(`
    SELECT w.* FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ?
    ORDER BY w.updated_at DESC
    LIMIT 1
  `).get(userId) as Workspace | undefined;

  if (fallback) {
    setUserActiveWorkspace(userId, fallback.id);
  }

  return fallback;
}

export function getWorkspace(userId: string, workspaceId: string): Workspace | undefined {
  requirePermission(userId, workspaceId, "workspace.view");
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Workspace | undefined;
}

export function createWorkspace(userId: string, name: string, description = ""): Workspace {
  const validName = validateWorkspaceName(name);
  const validDescription = validateDescription(description);

  const id = crypto.randomUUID();

  const tx = db.transaction(() => {
    getWorkspaceStorageDir(id);

    db.prepare(
      "INSERT INTO workspaces (id, user_id, name, description, is_active) VALUES (?, ?, ?, ?, 0)"
    ).run(id, userId, validName, validDescription);

    const roles = seedDefaultRoles(id);
    addMember(id, userId, roles.owner.id);
    seedDefaultStatuses(id);
    setUserActiveWorkspace(userId, id);

    return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace;
  });

  const ws = tx();

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
  setUserActiveWorkspace(userId, workspaceId);

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

  db.prepare(`
    UPDATE user_workspace_preferences
    SET active_workspace_id = NULL, updated_at = datetime('now')
    WHERE active_workspace_id = ?
  `).run(workspaceId);

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

export { listAccessibleWorkspaceIds, isWorkspaceMember, setApprovalFlowsEnabled, isApprovalFlowsEnabled };
