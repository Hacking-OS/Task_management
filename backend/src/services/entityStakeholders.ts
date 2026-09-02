import { db } from "../db.js";
import type { AssignableEntityType } from "./entityAssignments.js";

export function getStakeholderUserIds(entityType: AssignableEntityType, entityId: string): string[] {
  const table = entityType === "task" ? "tasks" : entityType === "issue" ? "issues" : "subtasks";
  const row = db.prepare(`SELECT user_id, assignee_id FROM ${table} WHERE id = ?`).get(entityId) as
    | { user_id: string; assignee_id: string | null }
    | undefined;
  if (!row) return [];

  const ids = new Set<string>();
  ids.add(row.user_id);
  const fromTable = db.prepare(`
    SELECT assignee_id FROM assignments
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at ASC
  `).all(entityType, entityId) as { assignee_id: string }[];
  if (fromTable.length > 0) {
    for (const { assignee_id } of fromTable) ids.add(assignee_id);
  } else if (row.assignee_id) {
    ids.add(row.assignee_id);
  }
  return [...ids];
}
