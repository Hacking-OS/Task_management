import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PermissionGate } from "../../shared/PermissionGate";
import { api } from "../../services/api";
import type { Subtask, Task, Severity } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { ErrorState, EmptyState } from "../../shared/StateBox";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { SeveritySelect } from "../../shared/SeveritySelect";
import { StatusBadge } from "../../shared/StatusBadge";
import { StatusSelect } from "../../shared/StatusSelect";
import { AssigneeFilterSelect, assigneeIdsFrom } from "../../shared/AssigneePicker";
import { UserAssignee } from "../../shared/UserAssignee";
import { formatDate } from "../../utils/severity";
import { useTaskList, type TaskSortKey } from "./taskListUtils";

export function TasksPage() {
  const { token, user } = useAuth();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtaskMap, setSubtaskMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [severity, setSeverity] = useState<string>(searchParams.get("severity") ?? "all");
  const [priority, setPriority] = useState<string>("all");
  const [assignee, setAssignee] = useState("all");
  const [dueBefore, setDueBefore] = useState("");
  const [sortKey, setSortKey] = useState<TaskSortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!token || !activeWorkspace?.id) return;
    setLoading(true);
    setError("");
    Promise.all([
      api.getTasks(token, activeWorkspace.id),
      api.getSubtasks(token, { workspace_id: activeWorkspace.id }),
    ])
      .then(([t, s]) => {
        setTasks(t.tasks);
        const map: Record<string, number> = {};
        s.subtasks.forEach((st: Subtask) => {
          if (st.task_id) map[st.task_id] = (map[st.task_id] ?? 0) + 1;
        });
        setSubtaskMap(map);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, activeWorkspace?.id]);

  const { pageItems, total, totalPages, safePage } = useTaskList(
    tasks,
    { search, status: status as "all" | Task["status"], severity: severity as "all" | Task["severity"], priority: priority as "all" | Task["priority"], assignee, dueBefore },
    sortKey,
    sortDir,
    page,
    pageSize,
    user?.id,
  );

  const toggleSort = (key: TaskSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  if (workspaceLoading || (loading && !error)) return <TablePageSkeleton cols={9} filters={6} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Manage and track work across your workspace."
        actions={
          <PermissionGate permission="task.create">
            <Link to="/tasks/create" className="btn btn-primary">Create Task</Link>
          </PermissionGate>
        }
      />

      <div className="filters-bar card">
        <input className="input" placeholder="Search tasks…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <StatusSelect entityType="task" value={status} onChange={setStatus} includeAll className="select" />
        <SeveritySelect value={severity as Severity | "all"} onChange={(v) => { setSeverity(v); setPage(1); }} includeAll />
        <select className="select" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <AssigneeFilterSelect value={assignee} onChange={(v) => { setAssignee(v); setPage(1); }} currentUserId={user?.id} />
        <input type="date" className="input" value={dueBefore} onChange={(e) => { setDueBefore(e.target.value); setPage(1); }} title="Due before" />
      </div>

      {pageItems.length === 0 ? (
        <EmptyState message="No tasks match your filters." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("title")}>Task</button></th>
                <th>Description</th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("status")}>Status</button></th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("severity")}>Severity</button></th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("priority")}>Priority</button></th>
                <th>Assignee</th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("due_date")}>Due Date</button></th>
                <th>Subtasks</th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("updated_at")}>Updated</button></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/tasks/${t.id}`} className="link-primary">{t.title}</Link></td>
                  <td className="truncate">{t.description || "—"}</td>
                  <td><StatusBadge entityType="task" slug={t.status} workspaceId={t.workspace_id ?? undefined} compact /></td>
                  <td><SeverityBadge severity={t.severity} compact /></td>
                  <td><span className="badge">{t.priority}</span></td>
                  <td><UserAssignee userIds={assigneeIdsFrom(t)} showName={false} size="sm" /></td>
                  <td>{t.due_date ? formatDate(t.due_date) : "—"}</td>
                  <td>{subtaskMap[t.id] ?? 0}</td>
                  <td>{formatDate(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <span>{total} task{total !== 1 ? "s" : ""}</span>
        <div>
          <button type="button" className="btn btn-sm btn-secondary" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="page-indicator">Page {safePage} of {totalPages}</span>
          <button type="button" className="btn btn-sm btn-secondary" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
