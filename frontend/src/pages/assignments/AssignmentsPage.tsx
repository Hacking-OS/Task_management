import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMembers } from "../../context/MembersContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { Issue, Subtask, Task } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { ErrorState, EmptyState } from "../../shared/StateBox";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { StatusBadge } from "../../shared/StatusBadge";
import { AssignUsers, assigneeIdsFrom, assignPermissionFor } from "../../shared/userAssignment";
import type { AssignableEntityType } from "../../shared/userAssignment";
import { EntityTypeBadge } from "../../shared/entityType";
import { formatDate } from "../../utils/severity";

interface AssignmentRow {
  id: string;
  entityType: AssignableEntityType;
  title: string;
  assigneeIds: string[];
  severity: Task["severity"];
  status: string;
  updatedAt: string;
  link: string;
}

function flattenAssignments(tasks: Task[], issues: Issue[], subtasks: Subtask[]): AssignmentRow[] {
  const list: AssignmentRow[] = [];

  for (const task of tasks) {
    const assigneeIds = assigneeIdsFrom(task);
    if (assigneeIds.length === 0) continue;
    list.push({
      id: task.id,
      entityType: "task",
      title: task.title,
      assigneeIds,
      severity: task.severity,
      status: task.status,
      updatedAt: task.updated_at,
      link: `/tasks/${task.id}`,
    });
  }

  for (const issue of issues) {
    const assigneeIds = assigneeIdsFrom(issue);
    if (assigneeIds.length === 0) continue;
    list.push({
      id: issue.id,
      entityType: "issue",
      title: issue.title,
      assigneeIds,
      severity: issue.severity,
      status: issue.status,
      updatedAt: issue.updated_at,
      link: `/issues/${issue.id}`,
    });
  }

  for (const sub of subtasks) {
    const assigneeIds = assigneeIdsFrom(sub);
    if (assigneeIds.length === 0) continue;
    list.push({
      id: sub.id,
      entityType: "subtask",
      title: sub.title,
      assigneeIds,
      severity: sub.severity,
      status: sub.status,
      updatedAt: sub.updated_at,
      link: sub.task_id ? `/tasks/${sub.task_id}` : sub.issue_id ? `/issues/${sub.issue_id}` : "/subtasks",
    });
  }

  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function AssignmentsPage() {
  const { token, user } = useAuth();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const { members } = useMembers();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const loadRows = useCallback(async () => {
    if (!token || !activeWorkspace?.id) return;
    setLoading(true);
    setError("");
    try {
      const [t, i, s] = await Promise.all([
        api.getTasks(token, activeWorkspace.id),
        api.getIssues(token, activeWorkspace.id),
        api.getSubtasks(token, { workspace_id: activeWorkspace.id }),
      ]);
      setRows(flattenAssignments(t.tasks, i.issues, s.subtasks));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") list = list.filter((r) => r.entityType === typeFilter);
    if (assigneeFilter === "unassigned") list = list.filter((r) => r.assigneeIds.length === 0);
    else if (assigneeFilter === "me" && user?.id) list = list.filter((r) => r.assigneeIds.includes(user.id));
    else if (assigneeFilter !== "all") list = list.filter((r) => r.assigneeIds.includes(assigneeFilter));
    return list;
  }, [rows, typeFilter, assigneeFilter, user?.id]);

  const workload = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const id of row.assigneeIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return members
      .map((m) => ({ member: m, count: counts.get(m.user_id) ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [rows, members]);

  const saveAssignees = async (row: AssignmentRow, assignee_ids: string[]) => {
    if (!token) return;
    if (row.entityType === "task") {
      await api.updateTask(token, row.id, { assignee_ids });
    } else if (row.entityType === "issue") {
      await api.updateIssue(token, row.id, { assignee_ids });
    } else {
      await api.updateSubtask(token, row.id, { assignee_ids });
    }
    await loadRows();
  };

  const canAssign = (entityType: AssignableEntityType) => hasPermission(assignPermissionFor(entityType));

  if (workspaceLoading || (loading && !error)) return <TablePageSkeleton cols={6} filters={2} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="Central hub for assigning workspace members to tasks, issues, and subtasks."
      />

      {workload.length > 0 && (
        <section className="card assignment-workload">
          <h3 className="card-title">Workload by member</h3>
          <ul className="assignment-workload-list">
            {workload.map(({ member, count }) => (
              <li key={member.id}>
                <button
                  type="button"
                  className={`assignment-workload-item${assigneeFilter === member.user_id ? " active" : ""}`}
                  onClick={() => setAssigneeFilter((current) => (current === member.user_id ? "all" : member.user_id))}
                >
                  <AssignUsers variant="display" userIds={[member.user_id]} size="sm" />
                  <span className="muted">{member.role_name}</span>
                  <strong>{count}</strong>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="filters-bar card">
        <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="task">Tasks</option>
          <option value="issue">Issues</option>
          <option value="subtask">Subtasks</option>
        </select>
        <AssignUsers variant="filter" value={assigneeFilter} onChange={setAssigneeFilter} currentUserId={user?.id} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No assignments match your filters in this workspace." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Assignees</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.entityType}-${r.id}`}>
                  <td><EntityTypeBadge type={r.entityType} compact /></td>
                  <td><Link to={r.link} className="link-primary">{r.title}</Link></td>
                  <td>
                    {canAssign(r.entityType) ? (
                      <AssignUsers
                        variant="inline"
                        entityType={r.entityType}
                        value={r.assigneeIds}
                        onSave={(ids) => saveAssignees(r, ids)}
                      />
                    ) : (
                      <AssignUsers variant="display" userIds={r.assigneeIds} size="sm" />
                    )}
                  </td>
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
