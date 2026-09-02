import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { ActivityTimeline } from "./ActivityTimeline";
import { SeverityBadge } from "./SeverityBadge";
import { SeveritySelect } from "./SeveritySelect";
import type { Comment, Severity, Subtask, Task } from "../types";

interface Props {
  taskId: string;
  onClose: () => void;
}

export function TaskDetailView({ taskId, onClose }: Props) {
  const { token } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tab, setTab] = useState<"details" | "activity">("details");
  const [commentBody, setCommentBody] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskSeverity, setSubtaskSeverity] = useState<Severity>("medium");
  const [editingSubtask, setEditingSubtask] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    if (!token) return;
    Promise.all([
      api.getTask(token, taskId),
      api.getSubtasks(token, { task_id: taskId }),
      api.getComments(token, "task", taskId),
    ]).then(([t, s, c]) => {
      setTask(t.task);
      setSubtasks(s.subtasks);
      setComments(c.comments);
    }).catch((err) => setError((err as Error).message));
  };

  useEffect(load, [token, taskId]);

  const saveTask = async (updates: Partial<Task>) => {
    if (!token || !task) return;
    await api.updateTask(token, task.id, updates);
    load();
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !commentBody.trim() || !task) return;
    await api.createComment(token, {
      entity_type: "task",
      entity_id: taskId,
      body: commentBody,
      workspace_id: task.workspace_id ?? undefined,
    });
    setCommentBody("");
    load();
  };

  const addSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !subtaskTitle.trim() || !task) return;
    await api.createSubtask(token, {
      title: subtaskTitle,
      task_id: taskId,
      workspace_id: task.workspace_id ?? undefined,
      severity: subtaskSeverity,
    });
    setSubtaskTitle("");
    setSubtaskSeverity("medium");
    load();
  };

  const updateSubtaskSeverity = async (subtask: Subtask, severity: Severity) => {
    if (!token) return;
    await api.updateSubtask(token, subtask.id, { severity });
    setEditingSubtask(null);
    load();
  };

  if (error) return <div className="detail-view error">{error}</div>;
  if (!task) return <div className="detail-view">Loading task…</div>;

  return (
    <div className="detail-view">
      <header className="detail-header">
        <div>
          <button type="button" className="link-btn" onClick={onClose}>← Back</button>
          <div className="task-title-row">
            <h2>{task.title}</h2>
            <SeverityBadge severity={task.severity ?? "medium"} />
          </div>
        </div>
        <div className="detail-tabs">
          <button type="button" className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button>
          <button type="button" className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity</button>
        </div>
      </header>

      {tab === "details" ? (
        <div className="detail-body">
          <p className="detail-desc">{task.description || "No description"}</p>
          <div className="detail-meta">
            <span>Status: {task.status}</span>
            <span>Priority: {task.priority}</span>
            <label className="inline-edit">
              Severity
              <SeveritySelect
                value={task.severity ?? "medium"}
                onChange={(severity) => saveTask({ severity })}
              />
            </label>
            {task.due_date && <span>Due: {new Date(task.due_date).toLocaleString()}</span>}
          </div>

          <section>
            <h3>Subtasks</h3>
            <form onSubmit={addSubtask} className="inline-form">
              <input placeholder="New subtask" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} />
              <SeveritySelect value={subtaskSeverity} onChange={setSubtaskSeverity} />
              <button type="submit">Add</button>
            </form>
            <ul className="subtask-list">
              {subtasks.map((s) => (
                <li key={s.id} className={`subtask-row ${s.status === "done" ? "done" : ""}`}>
                  <span>{s.title}</span>
                  {editingSubtask === s.id ? (
                    <SeveritySelect
                      value={s.severity ?? "medium"}
                      onChange={(severity) => updateSubtaskSeverity(s, severity)}
                    />
                  ) : (
                    <button type="button" className="severity-chip-btn" onClick={() => setEditingSubtask(s.id)}>
                      <SeverityBadge severity={s.severity ?? "medium"} compact />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Comments</h3>
            <form onSubmit={addComment} className="comment-form">
              <textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Add a comment…" rows={2} />
              <button type="submit">Comment</button>
            </form>
            <ul className="comment-list">
              {comments.map((c) => (
                <li key={c.id}><p>{c.body}</p><time>{new Date(c.created_at).toLocaleString()}</time></li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <ActivityTimeline entityType="task" entityId={taskId} title="Task activity" />
      )}
    </div>
  );
}
