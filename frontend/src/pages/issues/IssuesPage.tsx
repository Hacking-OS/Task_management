import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PermissionGate } from "../../shared/PermissionGate";
import { api } from "../../services/api";
import type { Issue, Subtask, Severity } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { ErrorState, EmptyState } from "../../shared/StateBox";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { SeveritySelect } from "../../shared/SeveritySelect";
import { StatusBadge } from "../../shared/StatusBadge";
import { StatusSelect } from "../../shared/StatusSelect";
import { AssigneeFilterSelect, assigneeIdsFrom } from "../../shared/AssigneePicker";
import { UserAssignee } from "../../shared/UserAssignee";
import { SEVERITY_RANK, formatDate } from "../../utils/severity";

type SortKey = "title" | "status" | "severity" | "updated_at";

export function IssuesPage() {
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState(searchParams.get("severity") ?? "all");
  const [assignee, setAssignee] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.getIssues(token, activeWorkspace?.id),
      api.getSubtasks(token, {}),
    ])
      .then(([i, s]) => { setIssues(i.issues); setSubtasks(s.subtasks); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, activeWorkspace?.id]);

  const filtered = useMemo(() => {
    let list = [...issues];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    if (status !== "all") list = list.filter((i) => i.status === status);
    if (severity !== "all") list = list.filter((i) => i.severity === severity);
    if (assignee === "unassigned") list = list.filter((i) => assigneeIdsFrom(i).length === 0);
    else if (assignee === "me" && user?.id) list = list.filter((i) => assigneeIdsFrom(i).includes(user.id));
    else if (assignee !== "all") list = list.filter((i) => assigneeIdsFrom(i).includes(assignee));

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "severity") cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [issues, search, status, severity, assignee, sortKey, sortDir, user?.id]);

  const subtaskCount = (issueId: string) => subtasks.filter((s) => s.issue_id === issueId).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  if (loading) return <TablePageSkeleton cols={6} filters={4} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Issues"
        subtitle="Track and resolve issues across your workspace."
        actions={
          <PermissionGate permission="issue.create">
            <Link to="/issues/create" className="btn btn-primary">Create Issue</Link>
          </PermissionGate>
        }
      />

      <div className="filters-bar card">
        <input className="input" placeholder="Search issues…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <StatusSelect entityType="issue" value={status} onChange={setStatus} includeAll className="select" />
        <SeveritySelect value={severity as Severity | "all"} onChange={(v) => setSeverity(v)} includeAll />
        <AssigneeFilterSelect value={assignee} onChange={setAssignee} currentUserId={user?.id} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No issues match your filters." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("title")}>Issue</button></th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("status")}>Status</button></th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("severity")}>Severity</button></th>
                <th>Assignee</th>
                <th>Subtasks</th>
                <th><button type="button" className="sort-btn" onClick={() => toggleSort("updated_at")}>Updated</button></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td><Link to={`/issues/${i.id}`} className="link-primary">{i.title}</Link></td>
                  <td><StatusBadge entityType="issue" slug={i.status} workspaceId={i.workspace_id ?? undefined} compact /></td>
                  <td><SeverityBadge severity={i.severity} compact /></td>
                  <td><UserAssignee userIds={assigneeIdsFrom(i)} showName={false} size="sm" /></td>
                  <td>{subtaskCount(i.id)}</td>
                  <td>{formatDate(i.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
