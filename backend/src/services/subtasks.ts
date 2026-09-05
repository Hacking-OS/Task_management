import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { recordSeverityChange } from "./severityEvents.js";
import { parseSeverity, SEVERITY_RANK } from "../validation/severity.js";
import { requirePermission, ForbiddenError, listWorkspaceIdsWithPermission } from "./authorization.js";
import { validateStatus, getDefaultStatusSlug, getStatus } from "./workspaceStatuses.js";
import { validateDescription, validateTitle } from "../validation/common.js";
import { setAssigneeIds } from "./entityAssignments.js";
import { notifyEntityWatchers } from "./entityEvents.js";
import type { Severity, Subtask } from "../types.js";

function sortSubtasks(rows: Subtask[]): Subtask[] {
  return [...rows].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.created_at.localeCompare(b.created_at));
}

export function listSubtasks(
  userId: string,
  filters?: { task_id?: string; issue_id?: string; severity?: Severity; workspace_id?: string }
): Subtask[] {
  if (filters?.workspace_id) {
    return listSubtasksInWorkspace(userId, filters.workspace_id, filters);
  }
  const ids = listWorkspaceIdsWithPermission(userId, "subtask.view");
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const params: unknown[] = [...ids];
  let sql = `SELECT * FROM subtasks WHERE workspace_id IN (${placeholders})`;
  if (filters?.task_id) { sql += " AND task_id = ?"; params.push(filters.task_id); }
  if (filters?.issue_id) { sql += " AND issue_id = ?"; params.push(filters.issue_id); }
  if (filters?.severity) { sql += " AND severity = ?"; params.push(filters.severity); }
  const rows = db.prepare(`${sql} ORDER BY created_at DESC`).all(...params) as Subtask[];
  return sortSubtasks(rows);
}

export function listSubtasksInWorkspace(
  userId: string,
  workspaceId: string,
  filters?: { task_id?: string; issue_id?: string; severity?: Severity }
): Subtask[] {
  requirePermission(userId, workspaceId, "subtask.view");
  const params: unknown[] = [workspaceId];
  let sql = "SELECT * FROM subtasks WHERE workspace_id = ?";
  if (filters?.task_id) { sql += " AND task_id = ?"; params.push(filters.task_id); }
  if (filters?.issue_id) { sql += " AND issue_id = ?"; params.push(filters.issue_id); }
  if (filters?.severity) { sql += " AND severity = ?"; params.push(filters.severity); }
  const order = filters?.task_id || filters?.issue_id ? "ASC" : "DESC";
  const rows = db.prepare(`${sql} ORDER BY created_at ${order}`).all(...params) as Subtask[];
  return sortSubtasks(rows);
}

export function getSubtask(userId: string, subtaskId: string): Subtask | undefined {
  const subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as Subtask | undefined;
  if (!subtask?.workspace_id) return undefined;
  try {
    requirePermission(userId, subtask.workspace_id, "subtask.view");
    return subtask;
  } catch { return undefined; }
}

export function createSubtask(
  userId: string,
  data: {
    title: string;
    task_id?: string;
    issue_id?: string;
    workspace_id?: string;
    assignee_id?: string;
    assignee_ids?: string[];
    severity?: Severity;
  }
): Subtask {
  if (!data.workspace_id) throw new Error("workspace_id is required");
  return createSubtaskInWorkspace(userId, data.workspace_id, data);
}

export function createSubtaskInWorkspace(
  userId: string,
  workspaceId: string,
  data: {
    title: string;
    task_id?: string;
    issue_id?: string;
    assignee_id?: string;
    assignee_ids?: string[];
    severity?: Severity;
  }
): Subtask {
  if (!data.task_id && !data.issue_id) throw new Error("Subtask requires task_id or issue_id");
  requirePermission(userId, workspaceId, "subtask.create");
  const title = validateTitle(data.title);
  if (data.task_id) {
    const task = db.prepare("SELECT workspace_id FROM tasks WHERE id = ?").get(data.task_id) as { workspace_id: string } | undefined;
    if (!task || task.workspace_id !== workspaceId) throw new Error("Task not found in workspace");
  }
  if (data.issue_id) {
    const issue = db.prepare("SELECT workspace_id FROM issues WHERE id = ?").get(data.issue_id) as { workspace_id: string } | undefined;
    if (!issue || issue.workspace_id !== workspaceId) throw new Error("Issue not found in workspace");
  }
  if (data.assignee_id || (data.assignee_ids && data.assignee_ids.length > 0)) {
    requirePermission(userId, workspaceId, "subtask.assign");
  }

  const assigneeIds = data.assignee_ids ?? (data.assignee_id ? [data.assignee_id] : []);
  const severity = data.severity !== undefined ? parseSeverity(data.severity) : "medium";
  const status = getDefaultStatusSlug(workspaceId, "subtask");
  validateStatus(workspaceId, "subtask", status);
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO subtasks (id, user_id, task_id, issue_id, workspace_id, title, status, assignee_id, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    data.task_id ?? null,
    data.issue_id ?? null,
    workspaceId,
    title,
    status,
    assigneeIds[0] ?? null,
    severity
  );

  let subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id) as Subtask;
  if (assigneeIds.length > 0) {
    setAssigneeIds(userId, workspaceId, "subtask", subtask.id, assigneeIds, subtask.title, "subtask.assign");
    subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id) as Subtask;
  }
  ActivityLogger.log({
    userId,
    workspaceId: subtask.workspace_id,
    entityType: "subtask",
    entityId: subtask.id,
    action: "created",
    description: `Subtask "${subtask.title}" was created`,
    metadata: { task_id: subtask.task_id, issue_id: subtask.issue_id, severity: subtask.severity },
  });
  notify({
    userId,
    type: "subtask",
    title: "Subtask created",
    message: `"${subtask.title}" was added.`,
    workspaceId: subtask.workspace_id,
    entityType: "subtask",
    entityId: subtask.id,
  });
  if (subtask.assignee_id && subtask.assignee_id !== userId) {
    notify({
      userId: subtask.assignee_id,
      type: "assignment",
      title: "Subtask assigned",
      message: `You were assigned subtask "${subtask.title}".`,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
    });
  }
  return subtask;
}

export function updateSubtask(
  userId: string,
  subtaskId: string,
  updates: Partial<Pick<Subtask, "title" | "status" | "assignee_id" | "severity">> & { assignee_ids?: string[] }
): Subtask {
  const existing = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as Subtask | undefined;
  if (!existing?.workspace_id) throw new Error("Subtask not found");
  const wsId = existing.workspace_id;
  requirePermission(userId, wsId, "subtask.edit");
  if (updates.status !== undefined && updates.status !== existing.status) {
    requirePermission(userId, wsId, "subtask.change_status");
    validateStatus(wsId, "subtask", updates.status);
  }
  if (updates.severity !== undefined && updates.severity !== existing.severity) requirePermission(userId, wsId, "subtask.change_severity");
  if (updates.assignee_ids !== undefined) requirePermission(userId, wsId, "subtask.assign");
  else if (updates.assignee_id !== undefined && updates.assignee_id !== existing.assignee_id) requirePermission(userId, wsId, "subtask.assign");

  const nextSeverity = updates.severity !== undefined ? parseSeverity(updates.severity) : existing.severity;
  const nextAssigneeId = updates.assignee_ids !== undefined
    ? (updates.assignee_ids[0] ?? null)
    : updates.assignee_id !== undefined
      ? updates.assignee_id
      : existing.assignee_id;

  db.prepare(`
    UPDATE subtasks SET title = ?, status = ?, assignee_id = ?, severity = ?, updated_at = datetime('now') WHERE id = ?
  `).run(
    updates.title ?? existing.title,
    updates.status ?? existing.status,
    nextAssigneeId,
    nextSeverity,
    subtaskId
  );

  let subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as Subtask;

  if (updates.assignee_ids !== undefined) {
    setAssigneeIds(userId, wsId, "subtask", subtask.id, updates.assignee_ids, subtask.title, "subtask.assign");
    subtask = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as Subtask;
  }

  if (nextSeverity !== (existing.severity ?? "medium")) {
    recordSeverityChange({
      userId,
      entityType: "subtask",
      entityId: subtask.id,
      entityTitle: subtask.title,
      workspaceId: subtask.workspace_id,
      assigneeId: subtask.assignee_id,
      oldSeverity: existing.severity ?? "medium",
      newSeverity: nextSeverity,
    });
  }

  const closedStatus = getStatus(wsId, "subtask", updates.status ?? existing.status);
  const wasClosed = getStatus(wsId, "subtask", existing.status)?.is_closed === 1;
  const isNowClosed = closedStatus?.is_closed === 1;

  if (updates.status !== undefined && updates.status !== existing.status && !(isNowClosed && !wasClosed)) {
    ActivityLogger.log({
      userId,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
      action: "status_changed",
      description: `Subtask "${subtask.title}" status changed to ${subtask.status}`,
      metadata: { from: existing.status, to: subtask.status },
    });
    notify({
      userId,
      type: "subtask",
      title: "Subtask status changed",
      message: `"${subtask.title}" is now ${subtask.status.replace("_", " ")}.`,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
    });
    notifyEntityWatchers(userId, subtask.workspace_id, "subtask", subtask.id, subtask.title, "status_changed");
  }

  if (isNowClosed && !wasClosed) {
    ActivityLogger.log({
      userId,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
      action: "completed",
      description: `Subtask "${subtask.title}" was completed`,
    });
    notify({
      userId,
      type: "success",
      title: "Subtask completed",
      message: `"${subtask.title}" was marked complete.`,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
    });
  }

  if (updates.assignee_id !== undefined && updates.assignee_id !== existing.assignee_id) {
    ActivityLogger.log({
      userId,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
      action: "assignment_changed",
      description: `Assignment changed for subtask "${subtask.title}"`,
    });
    notify({
      userId,
      type: "assignment",
      title: "Assignment changed",
      message: `Assignment updated for subtask "${subtask.title}".`,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
    });
    notifyEntityWatchers(userId, subtask.workspace_id, "subtask", subtask.id, subtask.title, "assigned");
    if (subtask.assignee_id && subtask.assignee_id !== userId) {
      notify({
        userId: subtask.assignee_id,
        type: "assignment",
        title: "Subtask assigned",
        message: `You were assigned subtask "${subtask.title}".`,
        workspaceId: subtask.workspace_id,
        entityType: "subtask",
        entityId: subtask.id,
      });
    }
  }

  if (updates.title !== undefined && updates.title !== existing.title) {
    ActivityLogger.log({
      userId,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
      action: "updated",
      description: `Subtask "${subtask.title}" was updated`,
    });
    notify({
      userId,
      type: "subtask",
      title: "Subtask updated",
      message: `"${subtask.title}" was updated.`,
      workspaceId: subtask.workspace_id,
      entityType: "subtask",
      entityId: subtask.id,
    });
    notifyEntityWatchers(userId, subtask.workspace_id, "subtask", subtask.id, subtask.title, "updated");
  }

  return subtask;
}

export function deleteSubtask(userId: string, subtaskId: string): void {
  const existing = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as Subtask | undefined;
  if (!existing?.workspace_id) throw new Error("Subtask not found");
  requirePermission(userId, existing.workspace_id, "subtask.delete");
  db.prepare("DELETE FROM subtasks WHERE id = ?").run(subtaskId);
  ActivityLogger.log({
    userId,
    workspaceId: existing.workspace_id,
    entityType: "subtask",
    entityId: subtaskId,
    action: "deleted",
    description: `Subtask "${existing.title}" was deleted`,
  });
  notify({
    userId,
    type: "subtask",
    title: "Subtask deleted",
    message: `"${existing.title}" was removed.`,
    workspaceId: existing.workspace_id,
    entityType: "subtask",
    entityId: subtaskId,
  });
  notifyEntityWatchers(userId, existing.workspace_id, "subtask", subtaskId, existing.title, "deleted");
}
