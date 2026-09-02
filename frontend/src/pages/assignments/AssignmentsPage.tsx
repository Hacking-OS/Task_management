import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { Issue, Subtask, Task } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { ErrorState, EmptyState } from "../../shared/StateBox";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { StatusBadge } from "../../shared/StatusBadge";
import { UserAssignee } from "../../shared/UserAssignee";
import { formatDate } from "../../utils/severity";

interface AssignmentRow {
  id: string;
  entityType: "task" | "issue" | "subtask";
  title: string;
  assigneeId: string;
  severity: Task["severity"];
  status: string;
  updatedAt: string;
  link: string;
}

export function AssignmentsPage() {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.getTasks(token, activeWorkspace?.id),
      api.getIssues(token, activeWorkspace?.id),
      api.getSubtasks(token, {}),
    ])
      .then(([t, i, s]) => {
        const list: AssignmentRow[] = [];
        t.tasks.filter((x) => x.assignee_id).forEach((task: Task) => {
          list.push({
            id: task.id,
            entityType: "task",
            title: task.title,
            assigneeId: task.assignee_id!,
            severity: task.severity,
            status: task.status,
            updatedAt: task.updated_at,
            link: `/tasks/${task.id}`,
          });
        });
        i.issues.filter((x) => x.assignee_id).forEach((issue: Issue) => {
          list.push({
            id: issue.id,
            entityType: "issue",
            title: issue.title,
            assigneeId: issue.assignee_id!,
            severity: issue.severity,
            status: issue.status,
            updatedAt: issue.updated_at,
            link: `/issues/${issue.id}`,
          });
        });
        s.subtasks.filter((x) => x.assignee_id).forEach((sub: Subtask) => {
          list.push({
            id: sub.id,
            entityType: "subtask",
            title: sub.title,
            assigneeId: sub.assignee_id!,
            severity: sub.severity,
            status: sub.status,
            updatedAt: sub.updated_at,
            link: sub.task_id ? `/tasks/${sub.task_id}` : sub.issue_id ? `/issues/${sub.issue_id}` : "/subtasks",
          });
        });
        setRows(list);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, activeWorkspace?.id]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return rows;
    return rows.filter((r) => r.entityType === typeFilter);
  }, [rows, typeFilter]);

  if (loading) return <TablePageSkeleton cols={6} filters={1} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Assignments" subtitle="All tasks, issues, and subtasks with assignees." />

      <div className="filters-bar card">
        <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="task">Tasks</option>
          <option value="issue">Issues</option>
          <option value="subtask">Subtasks</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No assignments found in this workspace." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.entityType}-${r.id}`}>
                  <td><span className="badge">{r.entityType}</span></td>
                  <td><Link to={r.link} className="link-primary">{r.title}</Link></td>
                  <td><UserAssignee userId={r.assigneeId} size="sm" /></td>
                  <td><StatusBadge entityType={r.entityType} slug={r.status} compact /></td>
                  <td><SeverityBadge severity={r.severity} compact /></td>
                  <td>{formatDate(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
