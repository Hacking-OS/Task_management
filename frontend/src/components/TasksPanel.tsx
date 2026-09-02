import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { SeverityBadge } from "./SeverityBadge";
import { SeveritySelect } from "./SeveritySelect";
import { SeverityFilterBar } from "./SeverityFilterBar";
import type { Severity, SeverityFilter, Task } from "../types";

interface Props {
  workspaceId?: string;
  selectedId?: string;
  severityFilter?: SeverityFilter;
  onSelect: (id: string) => void;
  onSeverityFilterChange?: (filter: SeverityFilter) => void;
}

export function TasksPanel({
  workspaceId,
  selectedId,
  severityFilter = "all",
  onSelect,
  onSeverityFilterChange,
}: Props) {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    const filter = severityFilter === "all" ? undefined : severityFilter;
    api.getTasks(token, workspaceId, filter).then(({ tasks }) => setTasks(tasks)).finally(() => setLoading(false));
  };

  useEffect(load, [token, workspaceId, severityFilter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !title.trim()) return;
    await api.createTask(token, {
      title,
      description,
      priority,
      severity,
      due_date: dueDate || null,
      workspace_id: workspaceId ?? null,
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    load();
  };

  const toggleStatus = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    const next = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
    await api.updateTask(token, task.id, { status: next });
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    await api.deleteTask(token, id);
    load();
  };

  if (loading) return <div className="panel-loading">Loading tasks…</div>;

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Tasks</h2>
        <span className="badge">{tasks.length}</span>
      </header>

      {onSeverityFilterChange && (
        <SeverityFilterBar value={severityFilter} onChange={onSeverityFilterChange} />
      )}

      <form className="task-form" onSubmit={create}>
        <input placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="form-row">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <SeveritySelect value={severity} onChange={setSeverity} />
          <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <button type="submit">Add task</button>
        </div>
      </form>

      <ul className="task-list">
        {tasks.length === 0 && <li className="empty">No tasks match this filter.</li>}
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`task-item status-${task.status} priority-${task.priority} severity-border-${task.severity} ${selectedId === task.id ? "selected" : ""}`}
            onClick={() => onSelect(task.id)}
          >
            <button className="status-btn" onClick={(e) => toggleStatus(task, e)} title="Change status">
              {task.status === "done" ? "✓" : task.status === "in_progress" ? "◐" : "○"}
            </button>
            <div className="task-body">
              <div className="task-title-row">
                <strong>{task.title}</strong>
                <SeverityBadge severity={task.severity ?? "medium"} compact />
              </div>
              {task.description && <p>{task.description}</p>}
              <span className="task-meta">
                {task.priority} · {task.status.replace("_", " ")}
                {task.due_date && ` · due ${new Date(task.due_date).toLocaleDateString()}`}
              </span>
            </div>
            <button className="icon-btn danger" onClick={(e) => remove(task.id, e)} title="Delete">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
