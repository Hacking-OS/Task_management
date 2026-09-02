import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { SeverityBadge } from "./SeverityBadge";
import { SeveritySelect } from "./SeveritySelect";
import { SeverityFilterBar } from "./SeverityFilterBar";
import type { Issue, Severity, SeverityFilter } from "../types";

interface Props {
  workspaceId?: string;
  selectedId?: string;
  severityFilter?: SeverityFilter;
  onSelect: (id: string) => void;
  onSeverityFilterChange?: (filter: SeverityFilter) => void;
}

export function IssuesPanel({
  workspaceId,
  selectedId,
  severityFilter = "all",
  onSelect,
  onSeverityFilterChange,
}: Props) {
  const { token } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    const filter = severityFilter === "all" ? undefined : severityFilter;
    api.getIssues(token, workspaceId, filter).then(({ issues }) => setIssues(issues)).finally(() => setLoading(false));
  };

  useEffect(load, [token, workspaceId, severityFilter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !title.trim()) return;
    await api.createIssue(token, { title, description, severity, workspace_id: workspaceId ?? null });
    setTitle("");
    setDescription("");
    load();
  };

  if (loading) return <div className="panel-loading">Loading issues…</div>;

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Issues</h2>
        <span className="badge">{issues.length}</span>
      </header>

      {onSeverityFilterChange && (
        <SeverityFilterBar value={severityFilter} onChange={onSeverityFilterChange} />
      )}

      <form className="task-form" onSubmit={create}>
        <input placeholder="Issue title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="form-row">
          <SeveritySelect value={severity} onChange={setSeverity} />
          <button type="submit">Open issue</button>
        </div>
      </form>

      <ul className="task-list">
        {issues.length === 0 && <li className="empty">No issues match this filter.</li>}
        {issues.map((issue) => (
          <li
            key={issue.id}
            className={`task-item severity-border-${issue.severity ?? "medium"} ${selectedId === issue.id ? "selected" : ""}`}
            onClick={() => onSelect(issue.id)}
          >
            <div className="task-body">
              <div className="task-title-row">
                <strong>{issue.title}</strong>
                <SeverityBadge severity={issue.severity ?? "medium"} compact />
              </div>
              {issue.description && <p>{issue.description}</p>}
              <span className="task-meta">{issue.priority} · {issue.status}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
