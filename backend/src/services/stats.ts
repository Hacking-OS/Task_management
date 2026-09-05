import { db } from "../db.js";
import type { Severity } from "../types.js";
import { requirePermission, listAccessibleWorkspaceIds } from "./authorization.js";
import { emptySeverityCounts, SEVERITIES } from "../validation/severity.js";

export type SeverityCounts = Record<Severity, number>;

export interface SeverityStats {
  tasks: SeverityCounts;
  issues: SeverityCounts;
  subtasks: SeverityCounts;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface CompletionStats {
  total: number;
  closed: number;
  percent: number;
}

export interface TaskSubtaskProgress {
  tasksWithSubtasks: number;
  avgSubtaskPercent: number;
  totalSubtasks: number;
  closedSubtasks: number;
}

export interface DashboardStats {
  severity: SeverityStats;
  totals: {
    tasks: number;
    issues: number;
    subtasks: number;
  };
  byStatus: {
    tasks: StatusCount[];
    issues: StatusCount[];
    subtasks: StatusCount[];
  };
  completion: {
    tasks: CompletionStats;
    issues: CompletionStats;
    subtasks: CompletionStats;
    overall: CompletionStats;
    taskSubtaskProgress: TaskSubtaskProgress;
  };
}

function workspaceFilter(
  workspaceId: string | undefined,
  userId: string,
  permission: string
): { clause: string; params: unknown[] } {
  if (workspaceId) {
    requirePermission(userId, workspaceId, permission);
    return { clause: "workspace_id = ?", params: [workspaceId] };
  }
  const memberIds = listAccessibleWorkspaceIds(userId);
  const permitted = memberIds.filter((id) => {
    try {
      requirePermission(userId, id, permission);
      return true;
    } catch {
      return false;
    }
  });
  if (permitted.length === 0) return { clause: "1=0", params: [] };
  return { clause: `workspace_id IN (${permitted.map(() => "?").join(",")})`, params: [...permitted] };
}

function countBySeverity(
  userId: string,
  table: "tasks" | "issues" | "subtasks",
  workspaceId?: string
): SeverityCounts {
  const perm = table === "tasks" ? "task.view" : table === "issues" ? "issue.view" : "subtask.view";
  const { clause, params } = workspaceFilter(workspaceId, userId, perm);
  const rows = db
    .prepare(`SELECT severity, COUNT(*) as count FROM ${table} WHERE ${clause} GROUP BY severity`)
    .all(...params) as { severity: string; count: number }[];

  const counts = emptySeverityCounts();
  for (const row of rows) {
    if (SEVERITIES.includes(row.severity as Severity)) {
      counts[row.severity as Severity] = row.count;
    }
  }
  return counts;
}

function countByStatus(
  userId: string,
  table: "tasks" | "issues" | "subtasks",
  workspaceId?: string
): StatusCount[] {
  const perm = table === "tasks" ? "task.view" : table === "issues" ? "issue.view" : "subtask.view";
  const { clause, params } = workspaceFilter(workspaceId, userId, perm);
  return db
    .prepare(`SELECT status, COUNT(*) as count FROM ${table} WHERE ${clause} GROUP BY status ORDER BY count DESC`)
    .all(...params) as StatusCount[];
}

function countTotal(
  userId: string,
  table: "tasks" | "issues" | "subtasks",
  workspaceId?: string
): number {
  const perm = table === "tasks" ? "task.view" : table === "issues" ? "issue.view" : "subtask.view";
  const { clause, params } = workspaceFilter(workspaceId, userId, perm);
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${clause}`).get(...params) as { count: number };
  return row.count;
}

function completionForEntity(
  userId: string,
  table: "tasks" | "issues" | "subtasks",
  entityType: "task" | "issue" | "subtask",
  workspaceId?: string
): CompletionStats {
  const perm = table === "tasks" ? "task.view" : table === "issues" ? "issue.view" : "subtask.view";
  const { clause, params } = workspaceFilter(workspaceId, userId, perm);
  const alias = table[0];
  const rows = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN ws.is_closed = 1 THEN 1 ELSE 0 END) as closed
    FROM ${table} ${alias}
    LEFT JOIN workspace_statuses ws
      ON ws.workspace_id = ${alias}.workspace_id
     AND ws.entity_type = ?
     AND ws.slug = ${alias}.status
    WHERE ${clause.replace(/workspace_id/g, `${alias}.workspace_id`)}
  `).get(entityType, ...params) as { total: number; closed: number | null };

  const total = rows.total ?? 0;
  const closed = rows.closed ?? 0;
  const percent = total === 0 ? 0 : Math.round((closed / total) * 1000) / 10;
  return { total, closed, percent };
}

function taskSubtaskProgress(userId: string, workspaceId?: string): TaskSubtaskProgress {
  const { clause, params } = workspaceFilter(workspaceId, userId, "task.view");
  const taskClause = clause.replace(/workspace_id/g, "t.workspace_id");
  const rows = db.prepare(`
    SELECT
      t.id,
      COUNT(s.id) as total_subtasks,
      SUM(CASE WHEN sw.is_closed = 1 THEN 1 ELSE 0 END) as closed_subtasks
    FROM tasks t
    LEFT JOIN subtasks s ON s.task_id = t.id
    LEFT JOIN workspace_statuses sw
      ON sw.workspace_id = s.workspace_id
     AND sw.entity_type = 'subtask'
     AND sw.slug = s.status
    WHERE ${taskClause}
    GROUP BY t.id
    HAVING total_subtasks > 0
  `).all(...params) as { id: string; total_subtasks: number; closed_subtasks: number | null }[];

  if (rows.length === 0) {
    return { tasksWithSubtasks: 0, avgSubtaskPercent: 0, totalSubtasks: 0, closedSubtasks: 0 };
  }

  let totalSubtasks = 0;
  let closedSubtasks = 0;
  let percentSum = 0;

  for (const row of rows) {
    const total = row.total_subtasks;
    const closed = row.closed_subtasks ?? 0;
    totalSubtasks += total;
    closedSubtasks += closed;
    percentSum += total === 0 ? 0 : (closed / total) * 100;
  }

  return {
    tasksWithSubtasks: rows.length,
    avgSubtaskPercent: Math.round((percentSum / rows.length) * 10) / 10,
    totalSubtasks,
    closedSubtasks,
  };
}

function overallCompletion(tasks: CompletionStats, issues: CompletionStats, subtasks: CompletionStats): CompletionStats {
  const total = tasks.total + issues.total + subtasks.total;
  const closed = tasks.closed + issues.closed + subtasks.closed;
  const percent = total === 0 ? 0 : Math.round((closed / total) * 1000) / 10;
  return { total, closed, percent };
}

export function getSeverityStats(userId: string, workspaceId?: string): SeverityStats {
  return {
    tasks: countBySeverity(userId, "tasks", workspaceId),
    issues: countBySeverity(userId, "issues", workspaceId),
    subtasks: countBySeverity(userId, "subtasks", workspaceId),
  };
}

export function getDashboardStats(userId: string, workspaceId?: string): DashboardStats {
  const taskCompletion = completionForEntity(userId, "tasks", "task", workspaceId);
  const issueCompletion = completionForEntity(userId, "issues", "issue", workspaceId);
  const subtaskCompletion = completionForEntity(userId, "subtasks", "subtask", workspaceId);

  return {
    severity: getSeverityStats(userId, workspaceId),
    totals: {
      tasks: countTotal(userId, "tasks", workspaceId),
      issues: countTotal(userId, "issues", workspaceId),
      subtasks: countTotal(userId, "subtasks", workspaceId),
    },
    byStatus: {
      tasks: countByStatus(userId, "tasks", workspaceId),
      issues: countByStatus(userId, "issues", workspaceId),
      subtasks: countByStatus(userId, "subtasks", workspaceId),
    },
    completion: {
      tasks: taskCompletion,
      issues: issueCompletion,
      subtasks: subtaskCompletion,
      overall: overallCompletion(taskCompletion, issueCompletion, subtaskCompletion),
      taskSubtaskProgress: taskSubtaskProgress(userId, workspaceId),
    },
  };
}
