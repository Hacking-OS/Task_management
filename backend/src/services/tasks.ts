import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify, checkDueTaskNotifications } from "./notifications.js";
import { recordSeverityChange } from "./severityEvents.js";
import { parseSeverity, SEVERITY_RANK } from "../validation/severity.js";
import { validateDescription, validatePriority, validateTitle } from "../validation/common.js";
import { requirePermission, ForbiddenError, listWorkspaceIdsWithPermission } from "./authorization.js";
import { validateStatus, getDefaultStatusSlug, getStatus } from "./workspaceStatuses.js";
import { enrichListWithAssignees, enrichWithAssignees, setAssigneeIds } from "./entityAssignments.js";
import { notifyEntityWatchers } from "./entityEvents.js";
import type { Severity, Task, TaskStatus, Priority } from "../types.js";

function sortBySeverity(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.created_at.localeCompare(a.created_at));
}

export function listTasks(userId: string, workspaceId?: string, severity?: Severity): Task[] {
  checkDueTaskNotifications(userId);
  if (workspaceId) return listTasksInWorkspace(userId, workspaceId, severity);

  const ids = listWorkspaceIdsWithPermission(userId, "task.view");
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const params: unknown[] = [...ids];
  let sql = `SELECT * FROM tasks WHERE workspace_id IN (${placeholders})`;
  if (severity) {
    sql += " AND severity = ?";
    params.push(severity);
  }
  sql += " ORDER BY created_at DESC";
  const tasks = db.prepare(sql).all(...params) as Task[];
  return sortBySeverity(enrichListWithAssignees("task", tasks));
}

export function listTasksInWorkspace(userId: string, workspaceId: string, severity?: Severity): Task[] {
  requirePermission(userId, workspaceId, "task.view");
  const params: unknown[] = [workspaceId];
  let sql = "SELECT * FROM tasks WHERE workspace_id = ?";
  if (severity) {
    sql += " AND severity = ?";
    params.push(severity);
  }
  sql += " ORDER BY created_at DESC";
  return sortBySeverity(enrichListWithAssignees("task", db.prepare(sql).all(...params) as Task[]));
}

export function getTask(userId: string, taskId: string): Task | undefined {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Task | undefined;
  if (!task?.workspace_id) return undefined;
  try {
    requirePermission(userId, task.workspace_id, "task.view");
    return enrichWithAssignees("task", task);
  } catch {
    return undefined;
  }
}

export function createTask(
  userId: string,
  data: {
    title: string;
    description?: string;
    workspace_id?: string;
    assignee_id?: string;
    assignee_ids?: string[];
    status?: TaskStatus;
    priority?: Priority;
    severity?: Severity;
    due_date?: string;
  }
): Task {
  if (!data.workspace_id) throw new Error("workspace_id is required");
  return createTaskInWorkspace(userId, data.workspace_id, data);
}

export function createTaskInWorkspace(
  userId: string,
  workspaceId: string,
  data: {
    title: string;
    description?: string;
    assignee_id?: string;
    assignee_ids?: string[];
    status?: TaskStatus;
    priority?: Priority;
    severity?: Severity;
    due_date?: string;
  }
): Task {
  requirePermission(userId, workspaceId, "task.create");
  const title = validateTitle(data.title);
  const description = validateDescription(data.description);
  const priority = validatePriority(data.priority);
  const assigneeIds = data.assignee_ids ?? (data.assignee_id ? [data.assignee_id] : []);
  if (assigneeIds.length > 0) requirePermission(userId, workspaceId, "task.assign");
  const severity = data.severity !== undefined ? parseSeverity(data.severity) : "medium";
  const status = data.status ?? getDefaultStatusSlug(workspaceId, "task");
  validateStatus(workspaceId, "task", status);
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO tasks (id, user_id, workspace_id, assignee_id, title, description, status, priority, severity, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    workspaceId,
    assigneeIds[0] ?? null,
    title,
    description,
    status,
    priority,
    severity,
    data.due_date ?? null
  );

  const task = enrichWithAssignees("task", db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task);
  if (assigneeIds.length > 0) {
    setAssigneeIds(userId, workspaceId, "task", task.id, assigneeIds, task.title, "task.assign");
  }
  ActivityLogger.log({
    userId,
    workspaceId: task.workspace_id,
    entityType: "task",
    entityId: task.id,
    action: "created",
    description: `Task "${task.title}" was created`,
    metadata: { severity: task.severity },
  });
  notify({
    userId,
    type: "task",
    title: "Task created",
    message: `"${task.title}" was added to your list.`,
    workspaceId: task.workspace_id,
    entityType: "task",
    entityId: task.id,
  });
  if (task.assignee_id && task.assignee_id !== userId) {
    notify({
      userId: task.assignee_id,
      type: "assignment",
      title: "Task assigned",
      message: `You were assigned "${task.title}".`,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
    });
  }
  return enrichWithAssignees("task", db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task);
}

export function updateTask(
  userId: string,
  taskId: string,
  updates: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "severity" | "due_date" | "workspace_id" | "assignee_id">> & { assignee_ids?: string[] }
): Task {
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Task | undefined;
  if (!existing?.workspace_id) throw new Error("Task not found");

  const wsId = existing.workspace_id;
  requirePermission(userId, wsId, "task.edit");

  if (updates.status !== undefined && updates.status !== existing.status) {
    requirePermission(userId, wsId, "task.change_status");
    validateStatus(wsId, "task", updates.status);
  }
  if (updates.severity !== undefined && updates.severity !== existing.severity) {
    requirePermission(userId, wsId, "task.change_severity");
  }
  if (updates.priority !== undefined && updates.priority !== existing.priority) {
    requirePermission(userId, wsId, "task.change_priority");
  }
  if (updates.assignee_ids !== undefined) {
    requirePermission(userId, wsId, "task.assign");
  } else if (updates.assignee_id !== undefined && updates.assignee_id !== existing.assignee_id) {
    requirePermission(userId, wsId, "task.assign");
  }
  if (updates.workspace_id !== undefined && updates.workspace_id !== existing.workspace_id) {
    throw new ForbiddenError("Cannot move tasks between workspaces");
  }

  const nextSeverity = updates.severity !== undefined ? parseSeverity(updates.severity) : existing.severity;
  const nextTitle = updates.title !== undefined ? validateTitle(updates.title) : existing.title;
  const nextDescription = updates.description !== undefined ? validateDescription(updates.description) : existing.description;
  const nextPriority = updates.priority !== undefined ? validatePriority(updates.priority) : existing.priority;

  const nextAssigneeId = updates.assignee_ids !== undefined
    ? (updates.assignee_ids[0] ?? null)
    : updates.assignee_id !== undefined
      ? updates.assignee_id
      : existing.assignee_id;

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, status = ?, priority = ?, severity = ?,
      due_date = ?, workspace_id = ?, assignee_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nextTitle,
    nextDescription,
    updates.status ?? existing.status,
    nextPriority,
    nextSeverity,
    updates.due_date !== undefined ? updates.due_date : existing.due_date,
    updates.workspace_id !== undefined ? updates.workspace_id : existing.workspace_id,
    nextAssigneeId,
    taskId
  );

  let task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Task;

  if (updates.assignee_ids !== undefined) {
    setAssigneeIds(userId, wsId, "task", task.id, updates.assignee_ids, task.title, "task.assign");
    task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Task;
  }

  if (nextSeverity !== existing.severity) {
    recordSeverityChange({
      userId,
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title,
      workspaceId: task.workspace_id,
      assigneeId: task.assignee_id,
      oldSeverity: existing.severity ?? "medium",
      newSeverity: nextSeverity,
    });
  }

  if (updates.status && updates.status !== existing.status) {
    ActivityLogger.log({
      userId,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
      action: "status_changed",
      description: `Task "${task.title}" status changed to ${task.status}`,
      metadata: { from: existing.status, to: task.status },
    });
    notify({
      userId,
      type: "task",
      title: "Task status changed",
      message: `"${task.title}" is now ${task.status.replace("_", " ")}.`,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
    });
    notifyEntityWatchers(userId, task.workspace_id, "task", task.id, task.title, "status_changed");
    if (getStatus(task.workspace_id!, "task", task.status)?.is_closed === 1) {
      notify({
        userId,
        type: "success",
        title: "Task completed",
        message: `"${task.title}" was marked as done.`,
        workspaceId: task.workspace_id,
        entityType: "task",
        entityId: task.id,
      });
    }
  }

  if (updates.priority && updates.priority !== existing.priority) {
    ActivityLogger.log({
      userId,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
      action: "priority_changed",
      description: `Task "${task.title}" priority changed to ${task.priority}`,
      metadata: { from: existing.priority, to: task.priority },
    });
  }

  if (updates.assignee_id !== undefined && updates.assignee_id !== existing.assignee_id) {
    ActivityLogger.log({
      userId,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
      action: "assignment_changed",
      description: `Assignment changed for "${task.title}"`,
      metadata: { from: existing.assignee_id, to: task.assignee_id },
    });
    notify({
      userId,
      type: "assignment",
      title: "Assignment changed",
      message: `Assignment updated for "${task.title}".`,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
    });
    if (task.assignee_id && task.assignee_id !== userId) {
      notify({
        userId: task.assignee_id,
        type: "assignment",
        title: "Task assigned",
        message: `You were assigned "${task.title}".`,
        workspaceId: task.workspace_id,
        entityType: "task",
        entityId: task.id,
      });
    }
  }

  if (updates.title || updates.description) {
    ActivityLogger.log({
      userId,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
      action: "updated",
      description: `Task "${task.title}" was updated`,
    });
    notify({
      userId,
      type: "task",
      title: "Task updated",
      message: `"${task.title}" was updated.`,
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
    });
    notifyEntityWatchers(userId, task.workspace_id, "task", task.id, task.title, "updated");
  }

  return enrichWithAssignees("task", task);
}

export function deleteTask(userId: string, taskId: string): void {
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Task | undefined;
  if (!existing?.workspace_id) throw new Error("Task not found");
  requirePermission(userId, existing.workspace_id, "task.delete");

  db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
  ActivityLogger.log({
    userId,
    workspaceId: existing.workspace_id,
    entityType: "task",
    entityId: taskId,
    action: "deleted",
    description: `Task "${existing.title}" was deleted`,
  });
  notify({
    userId,
    type: "task",
    title: "Task deleted",
    message: `"${existing.title}" was removed.`,
    workspaceId: existing.workspace_id,
    entityType: "task",
    entityId: taskId,
  });
  notifyEntityWatchers(userId, existing.workspace_id, "task", taskId, existing.title, "deleted");
}
