import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { requirePermission } from "./authorization.js";
import {
  validateDescription,
  validateEntityId,
  validateHours,
  validateTimesheetEntityType,
  validateWorkDate,
} from "../validation/common.js";
import type { TimeEntry } from "../types.js";

function assertEntityInWorkspace(
  entityType: "task" | "issue" | "subtask",
  entityId: string,
  workspaceId: string
): void {
  if (entityType === "task") {
    const row = db.prepare("SELECT workspace_id FROM tasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
    if (!row || row.workspace_id !== workspaceId) throw new Error("Task not found in workspace");
    return;
  }
  if (entityType === "issue") {
    const row = db.prepare("SELECT workspace_id FROM issues WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
    if (!row || row.workspace_id !== workspaceId) throw new Error("Issue not found in workspace");
    return;
  }
  const row = db.prepare("SELECT workspace_id FROM subtasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
  if (!row || row.workspace_id !== workspaceId) throw new Error("Subtask not found in workspace");
}

export function listTimeEntries(
  userId: string,
  workspaceId: string,
  filters?: { entity_type?: string; entity_id?: string; user_id?: string; from?: string; to?: string }
): TimeEntry[] {
  requirePermission(userId, workspaceId, "timesheet.view");
  const params: unknown[] = [workspaceId];
  let sql = "SELECT * FROM time_entries WHERE workspace_id = ?";

  const viewAll = filters?.user_id && filters.user_id !== userId;
  if (viewAll) {
    requirePermission(userId, workspaceId, "timesheet.view_all");
    sql += " AND user_id = ?";
    params.push(filters.user_id);
  } else if (filters?.user_id) {
    sql += " AND user_id = ?";
    params.push(filters.user_id);
  } else {
    const canViewAll = tryHasPermission(userId, workspaceId, "timesheet.view_all");
    if (!canViewAll) {
      sql += " AND user_id = ?";
      params.push(userId);
    }
  }

  if (filters?.entity_type) {
    sql += " AND entity_type = ?";
    params.push(validateTimesheetEntityType(filters.entity_type));
  }
  if (filters?.entity_id) {
    sql += " AND entity_id = ?";
    params.push(validateEntityId(filters.entity_id));
  }
  if (filters?.from) {
    sql += " AND work_date >= ?";
    params.push(filters.from);
  }
  if (filters?.to) {
    sql += " AND work_date <= ?";
    params.push(filters.to);
  }

  sql += " ORDER BY work_date DESC, created_at DESC";
  return db.prepare(sql).all(...params) as TimeEntry[];
}

function tryHasPermission(userId: string, workspaceId: string, permission: string): boolean {
  try {
    requirePermission(userId, workspaceId, permission);
    return true;
  } catch {
    return false;
  }
}

export function createTimeEntry(
  userId: string,
  workspaceId: string,
  data: {
    entity_type: string;
    entity_id: string;
    work_date: string;
    hours: number;
    description?: string;
  }
): TimeEntry {
  requirePermission(userId, workspaceId, "timesheet.create");
  const entityType = validateTimesheetEntityType(data.entity_type);
  const entityId = validateEntityId(data.entity_id);
  const workDate = validateWorkDate(data.work_date);
  const hours = validateHours(data.hours);
  const description = validateDescription(data.description, 2000);
  assertEntityInWorkspace(entityType, entityId, workspaceId);

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO time_entries (id, user_id, workspace_id, entity_type, entity_id, work_date, hours, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, workspaceId, entityType, entityId, workDate, hours, description);

  const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as TimeEntry;
  ActivityLogger.log({
    userId,
    workspaceId,
    entityType: "task",
    entityId: entry.id,
    action: "timesheet_logged",
    description: `Logged ${hours}h on ${entityType}`,
    metadata: { entity_type: entityType, entity_id: entityId, hours },
  });
  return entry;
}

export function updateTimeEntry(
  userId: string,
  entryId: string,
  updates: Partial<Pick<TimeEntry, "work_date" | "hours" | "description">>
): TimeEntry {
  const existing = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(entryId) as TimeEntry | undefined;
  if (!existing) throw new Error("Time entry not found");
  requirePermission(userId, existing.workspace_id, "timesheet.edit");
  if (existing.user_id !== userId) requirePermission(userId, existing.workspace_id, "timesheet.view_all");

  const workDate = updates.work_date !== undefined ? validateWorkDate(updates.work_date) : existing.work_date;
  const hours = updates.hours !== undefined ? validateHours(updates.hours) : existing.hours;
  const description = updates.description !== undefined ? validateDescription(updates.description, 2000) : existing.description;

  db.prepare(`
    UPDATE time_entries SET work_date = ?, hours = ?, description = ?, updated_at = datetime('now') WHERE id = ?
  `).run(workDate, hours, description, entryId);

  return db.prepare("SELECT * FROM time_entries WHERE id = ?").get(entryId) as TimeEntry;
}

export function deleteTimeEntry(userId: string, entryId: string): void {
  const existing = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(entryId) as TimeEntry | undefined;
  if (!existing) throw new Error("Time entry not found");
  requirePermission(userId, existing.workspace_id, "timesheet.delete");
  if (existing.user_id !== userId) requirePermission(userId, existing.workspace_id, "timesheet.view_all");
  db.prepare("DELETE FROM time_entries WHERE id = ?").run(entryId);
}

export function getTimeSummary(userId: string, workspaceId: string, filters?: { from?: string; to?: string }): { totalHours: number; entryCount: number } {
  requirePermission(userId, workspaceId, "timesheet.view");
  const params: unknown[] = [workspaceId];
  let sql = "SELECT COALESCE(SUM(hours), 0) as totalHours, COUNT(*) as entryCount FROM time_entries WHERE workspace_id = ?";
  if (!tryHasPermission(userId, workspaceId, "timesheet.view_all")) {
    sql += " AND user_id = ?";
    params.push(userId);
  }
  if (filters?.from) {
    sql += " AND work_date >= ?";
    params.push(filters.from);
  }
  if (filters?.to) {
    sql += " AND work_date <= ?";
    params.push(filters.to);
  }
  return db.prepare(sql).get(...params) as { totalHours: number; entryCount: number };
}
