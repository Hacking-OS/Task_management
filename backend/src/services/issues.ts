import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { recordSeverityChange } from "./severityEvents.js";
import { parseSeverity, SEVERITY_RANK } from "../validation/severity.js";
import { requirePermission, ForbiddenError, listAccessibleWorkspaceIds } from "./authorization.js";
import { validateStatus, getDefaultStatusSlug } from "./workspaceStatuses.js";
import { enrichListWithAssignees, enrichWithAssignees, setAssigneeIds } from "./entityAssignments.js";
import { notifyEntityWatchers } from "./entityEvents.js";
import { validateDescription, validatePriority, validateTitle } from "../validation/common.js";
import type { Issue, IssueStatus, Priority, Severity } from "../types.js";

function sortBySeverity(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.created_at.localeCompare(a.created_at));
}

export function listIssues(userId: string, workspaceId?: string, severity?: Severity): Issue[] {
  if (workspaceId) return listIssuesInWorkspace(userId, workspaceId, severity);
  const ids = listAccessibleWorkspaceIds(userId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const params: unknown[] = [...ids];
  let sql = `SELECT * FROM issues WHERE workspace_id IN (${placeholders})`;
  if (severity) { sql += " AND severity = ?"; params.push(severity); }
  return sortBySeverity(enrichListWithAssignees("issue", db.prepare(`${sql} ORDER BY created_at DESC`).all(...params) as Issue[]));
}

export function listIssuesInWorkspace(userId: string, workspaceId: string, severity?: Severity): Issue[] {
  requirePermission(userId, workspaceId, "issue.view");
  const params: unknown[] = [workspaceId];
  let sql = "SELECT * FROM issues WHERE workspace_id = ?";
  if (severity) { sql += " AND severity = ?"; params.push(severity); }
  return sortBySeverity(enrichListWithAssignees("issue", db.prepare(`${sql} ORDER BY created_at DESC`).all(...params) as Issue[]));
}

export function getIssue(userId: string, issueId: string): Issue | undefined {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Issue | undefined;
  if (!issue?.workspace_id) return undefined;
  try {
    requirePermission(userId, issue.workspace_id, "issue.view");
    return enrichWithAssignees("issue", issue);
  } catch { return undefined; }
}

export function createIssue(
  userId: string,
  data: {
    title: string;
    description?: string;
    workspace_id?: string;
    assignee_id?: string;
    assignee_ids?: string[];
    status?: IssueStatus;
    priority?: Priority;
    severity?: Severity;
  }
): Issue {
  if (!data.workspace_id) throw new Error("workspace_id is required");
  return createIssueInWorkspace(userId, data.workspace_id, data);
}

export function createIssueInWorkspace(
  userId: string,
  workspaceId: string,
  data: {
    title: string;
    description?: string;
    assignee_id?: string;
    assignee_ids?: string[];
    status?: IssueStatus;
    priority?: Priority;
    severity?: Severity;
  }
): Issue {
  requirePermission(userId, workspaceId, "issue.create");
  const title = validateTitle(data.title);
  const description = validateDescription(data.description);
  const priority = validatePriority(data.priority);
  const assigneeIds = data.assignee_ids ?? (data.assignee_id ? [data.assignee_id] : []);
  if (assigneeIds.length > 0) requirePermission(userId, workspaceId, "issue.assign");
  const severity = data.severity !== undefined ? parseSeverity(data.severity) : "medium";
  const status = data.status ?? getDefaultStatusSlug(workspaceId, "issue");
  validateStatus(workspaceId, "issue", status);
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO issues (id, user_id, workspace_id, title, description, status, priority, severity, assignee_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    workspaceId,
    title,
    description,
    status,
    priority,
    severity,
    assigneeIds[0] ?? null
  );

  let issue = enrichWithAssignees("issue", db.prepare("SELECT * FROM issues WHERE id = ?").get(id) as Issue);
  if (assigneeIds.length > 0) {
    setAssigneeIds(userId, workspaceId, "issue", issue.id, assigneeIds, issue.title, "issue.assign");
    issue = enrichWithAssignees("issue", db.prepare("SELECT * FROM issues WHERE id = ?").get(id) as Issue);
  }
  ActivityLogger.log({
    userId,
    workspaceId: issue.workspace_id,
    entityType: "issue",
    entityId: issue.id,
    action: "created",
    description: `Issue "${issue.title}" was created`,
    metadata: { severity: issue.severity },
  });
  notify({
    userId,
    type: "issue",
    title: "Issue created",
    message: `"${issue.title}" was opened.`,
    workspaceId: issue.workspace_id,
    entityType: "issue",
    entityId: issue.id,
  });
  if (issue.assignee_id && issue.assignee_id !== userId) {
    notify({
      userId: issue.assignee_id,
      type: "assignment",
      title: "Issue assigned",
      message: `You were assigned issue "${issue.title}".`,
      workspaceId: issue.workspace_id,
      entityType: "issue",
      entityId: issue.id,
    });
  }
  return issue;
}

export function updateIssue(
  userId: string,
  issueId: string,
  updates: Partial<Pick<Issue, "title" | "description" | "status" | "priority" | "severity" | "workspace_id" | "assignee_id">> & { assignee_ids?: string[] }
): Issue {
  const existing = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Issue | undefined;
  if (!existing?.workspace_id) throw new Error("Issue not found");
  const wsId = existing.workspace_id;
  requirePermission(userId, wsId, "issue.edit");
  if (updates.status !== undefined && updates.status !== existing.status) {
    requirePermission(userId, wsId, "issue.change_status");
    validateStatus(wsId, "issue", updates.status);
  }
  if (updates.severity !== undefined && updates.severity !== existing.severity) requirePermission(userId, wsId, "issue.change_severity");
  if (updates.assignee_ids !== undefined) requirePermission(userId, wsId, "issue.assign");
  else if (updates.assignee_id !== undefined && updates.assignee_id !== existing.assignee_id) requirePermission(userId, wsId, "issue.assign");
  if (updates.workspace_id !== undefined && updates.workspace_id !== existing.workspace_id) throw new ForbiddenError("Cannot move issues between workspaces");

  const nextSeverity = updates.severity !== undefined ? parseSeverity(updates.severity) : existing.severity;
  const nextAssigneeId = updates.assignee_ids !== undefined
    ? (updates.assignee_ids[0] ?? null)
    : updates.assignee_id !== undefined ? updates.assignee_id : existing.assignee_id;

  db.prepare(`
    UPDATE issues SET
      title = ?, description = ?, status = ?, priority = ?, severity = ?,
      workspace_id = ?, assignee_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    updates.title ?? existing.title,
    updates.description ?? existing.description,
    updates.status ?? existing.status,
    updates.priority ?? existing.priority,
    nextSeverity,
    updates.workspace_id !== undefined ? updates.workspace_id : existing.workspace_id,
    nextAssigneeId,
    issueId
  );

  let issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Issue;
  if (updates.assignee_ids !== undefined) {
    setAssigneeIds(userId, wsId, "issue", issue.id, updates.assignee_ids, issue.title, "issue.assign");
    issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Issue;
  }

  if (nextSeverity !== (existing.severity ?? "medium")) {
    recordSeverityChange({
      userId,
      entityType: "issue",
      entityId: issue.id,
      entityTitle: issue.title,
      workspaceId: issue.workspace_id,
      assigneeId: issue.assignee_id,
      oldSeverity: existing.severity ?? "medium",
      newSeverity: nextSeverity,
    });
  }

  if (updates.status && updates.status !== existing.status) {
    ActivityLogger.log({
      userId,
      workspaceId: issue.workspace_id,
      entityType: "issue",
      entityId: issue.id,
      action: "status_changed",
      description: `Issue "${issue.title}" status changed to ${issue.status}`,
      metadata: { from: existing.status, to: issue.status },
    });
    notify({
      userId,
      type: "issue",
      title: "Issue status changed",
      message: `"${issue.title}" is now ${issue.status.replace("_", " ")}.`,
      workspaceId: issue.workspace_id,
      entityType: "issue",
      entityId: issue.id,
    });
    notifyEntityWatchers(userId, issue.workspace_id, "issue", issue.id, issue.title, "status_changed");
  }

  if (updates.title !== undefined || updates.description !== undefined || updates.priority !== undefined) {
    const changed =
      (updates.title !== undefined && updates.title !== existing.title) ||
      (updates.description !== undefined && updates.description !== existing.description) ||
      (updates.priority !== undefined && updates.priority !== existing.priority);
    if (changed) {
      ActivityLogger.log({
        userId,
        workspaceId: issue.workspace_id,
        entityType: "issue",
        entityId: issue.id,
        action: "updated",
        description: `Issue "${issue.title}" was updated`,
      });
      notify({
        userId,
        type: "issue",
        title: "Issue updated",
        message: `"${issue.title}" was updated.`,
        workspaceId: issue.workspace_id,
        entityType: "issue",
        entityId: issue.id,
      });
      notifyEntityWatchers(userId, issue.workspace_id, "issue", issue.id, issue.title, "updated");
    }
  }

  if (updates.priority !== undefined && updates.priority !== existing.priority) {
    ActivityLogger.log({
      userId,
      workspaceId: issue.workspace_id,
      entityType: "issue",
      entityId: issue.id,
      action: "priority_changed",
      description: `Issue "${issue.title}" priority changed to ${issue.priority}`,
      metadata: { from: existing.priority, to: issue.priority },
    });
  }

  if (updates.assignee_id !== undefined && updates.assignee_id !== existing.assignee_id) {
    ActivityLogger.log({
      userId,
      workspaceId: issue.workspace_id,
      entityType: "issue",
      entityId: issue.id,
      action: "assignment_changed",
      description: `Assignment changed for issue "${issue.title}"`,
      metadata: { from: existing.assignee_id, to: issue.assignee_id },
    });
    notify({
      userId,
      type: "assignment",
      title: "Assignment changed",
      message: `Assignment updated for issue "${issue.title}".`,
      workspaceId: issue.workspace_id,
      entityType: "issue",
      entityId: issue.id,
    });
    if (issue.assignee_id && issue.assignee_id !== userId) {
      notify({
        userId: issue.assignee_id,
        type: "assignment",
        title: "Issue assigned",
        message: `You were assigned issue "${issue.title}".`,
        workspaceId: issue.workspace_id,
        entityType: "issue",
        entityId: issue.id,
      });
    }
  }

  return enrichWithAssignees("issue", issue);
}

export function deleteIssue(userId: string, issueId: string): void {
  const existing = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Issue | undefined;
  if (!existing?.workspace_id) throw new Error("Issue not found");
  requirePermission(userId, existing.workspace_id, "issue.delete");
  db.prepare("DELETE FROM issues WHERE id = ?").run(issueId);
  ActivityLogger.log({
    userId,
    workspaceId: existing.workspace_id,
    entityType: "issue",
    entityId: issueId,
    action: "deleted",
    description: `Issue "${existing.title}" was deleted`,
  });
  notify({
    userId,
    type: "issue",
    title: "Issue deleted",
    message: `"${existing.title}" was removed.`,
    workspaceId: existing.workspace_id,
    entityType: "issue",
    entityId: issueId,
  });
  notifyEntityWatchers(userId, existing.workspace_id, "issue", issueId, existing.title, "deleted");
}
