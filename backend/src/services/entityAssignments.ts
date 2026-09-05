import { db } from "../db.js";
import { requirePermission } from "./authorization.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { notifyEntityWatchers } from "./entityEvents.js";
import type { EntityType } from "../types.js";

export type AssignableEntityType = "task" | "issue" | "subtask";

export function listAssigneeIds(entityType: AssignableEntityType, entityId: string): string[] {
  const rows = db.prepare(`
    SELECT assignee_id FROM assignments
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at ASC
  `).all(entityType, entityId) as { assignee_id: string }[];
  return rows.map((r) => r.assignee_id);
}

export function listAssigneeIdsBatch(
  entityType: AssignableEntityType,
  entityIds: string[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (entityIds.length === 0) return map;
  const placeholders = entityIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT entity_id, assignee_id FROM assignments
    WHERE entity_type = ? AND entity_id IN (${placeholders})
    ORDER BY created_at ASC
  `).all(entityType, ...entityIds) as { entity_id: string; assignee_id: string }[];
  for (const row of rows) {
    const list = map.get(row.entity_id) ?? [];
    list.push(row.assignee_id);
    map.set(row.entity_id, list);
  }
  return map;
}

export function resolveAssigneeIds(
  entityType: AssignableEntityType,
  entityId: string,
  legacyAssigneeId: string | null
): string[] {
  const fromTable = listAssigneeIds(entityType, entityId);
  if (fromTable.length > 0) return fromTable;
  return legacyAssigneeId ? [legacyAssigneeId] : [];
}

function assertAssigneesInWorkspace(workspaceId: string, assigneeIds: string[]): void {
  for (const assigneeId of assigneeIds) {
    const member = db.prepare(`
      SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?
    `).get(workspaceId, assigneeId);
    if (!member) throw new Error("Assignee must be a workspace member");
  }
}

export function setAssigneeIds(
  actorUserId: string,
  workspaceId: string,
  entityType: AssignableEntityType,
  entityId: string,
  assigneeIds: string[],
  entityTitle: string,
  assignPermission: string
): string[] {
  const unique = [...new Set(assigneeIds.filter(Boolean))];
  if (unique.length > 0) {
    requirePermission(actorUserId, workspaceId, assignPermission);
    assertAssigneesInWorkspace(workspaceId, unique);
  }

  const existing = listAssigneeIds(entityType, entityId);
  const added = unique.filter((id) => !existing.includes(id));
  const removed = existing.filter((id) => !unique.includes(id));

  db.prepare("DELETE FROM assignments WHERE entity_type = ? AND entity_id = ?").run(entityType, entityId);

  const insert = db.prepare(`
    INSERT INTO assignments (id, user_id, assignee_id, workspace_id, entity_type, entity_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const assigneeId of unique) {
    insert.run(crypto.randomUUID(), actorUserId, assigneeId, workspaceId, entityType, entityId);
  }

  const primary = unique[0] ?? null;
  const table = entityType === "task" ? "tasks" : entityType === "issue" ? "issues" : "subtasks";
  db.prepare(`UPDATE ${table} SET assignee_id = ?, updated_at = datetime('now') WHERE id = ?`).run(primary, entityId);

  if (added.length || removed.length) {
    ActivityLogger.log({
      userId: actorUserId,
      workspaceId,
      entityType,
      entityId,
      action: "assignees_updated",
      description: `Assignees updated on ${entityType} "${entityTitle}"`,
      metadata: { added, removed, assignee_ids: unique },
    });

    for (const assigneeId of added) {
      if (assigneeId !== actorUserId) {
        notify({
          userId: assigneeId,
          type: "assignment",
          title: "You were assigned",
          message: `You were assigned to ${entityType} "${entityTitle}".`,
          workspaceId,
          entityType: entityType as EntityType,
          entityId,
          metadata: { action: "view_assignment", entity_type: entityType, entity_id: entityId },
        });
      }
    }
    notifyEntityWatchers(actorUserId, workspaceId, entityType, entityId, entityTitle, "assigned", added);
  }

  return unique;
}

export function backfillAssignmentsFromLegacy(): void {
  for (const entityType of ["task", "issue", "subtask"] as AssignableEntityType[]) {
    const table = entityType === "task" ? "tasks" : entityType === "issue" ? "issues" : "subtasks";
    const rows = db.prepare(`
      SELECT id, user_id, workspace_id, assignee_id FROM ${table}
      WHERE assignee_id IS NOT NULL
    `).all() as { id: string; user_id: string; workspace_id: string | null; assignee_id: string }[];

    for (const row of rows) {
      if (!row.workspace_id) continue;
      const existing = listAssigneeIds(entityType, row.id);
      if (existing.length > 0) continue;
      db.prepare(`
        INSERT INTO assignments (id, user_id, assignee_id, workspace_id, entity_type, entity_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), row.user_id, row.assignee_id, row.workspace_id, entityType, row.id);
    }
  }
}

export function enrichWithAssignees<T extends { id: string; assignee_id: string | null }>(
  entityType: AssignableEntityType,
  item: T
): T & { assignee_ids: string[] } {
  return {
    ...item,
    assignee_ids: resolveAssigneeIds(entityType, item.id, item.assignee_id),
  };
}

export function enrichListWithAssignees<T extends { id: string; assignee_id: string | null }>(
  entityType: AssignableEntityType,
  items: T[]
): (T & { assignee_ids: string[] })[] {
  const batch = listAssigneeIdsBatch(entityType, items.map((i) => i.id));
  return items.map((item) => {
    const fromBatch = batch.get(item.id);
    const assignee_ids = fromBatch && fromBatch.length > 0
      ? fromBatch
      : item.assignee_id
        ? [item.assignee_id]
        : [];
    return { ...item, assignee_ids };
  });
}
