import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { ActivityTimeline } from "./ActivityTimeline";
import { SeverityBadge } from "./SeverityBadge";
import { SeveritySelect } from "./SeveritySelect";
import type { Comment, Issue, Severity, Subtask } from "../types";

interface Props {
  issueId: string;
  onClose: () => void;
}

export function IssueDetailView({ issueId, onClose }: Props) {
  const { token } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tab, setTab] = useState<"details" | "activity">("details");
  const [commentBody, setCommentBody] = useState("");
  const [editingSubtask, setEditingSubtask] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    if (!token) return;
    Promise.all([
      api.getIssue(token, issueId),
      api.getSubtasks(token, { issue_id: issueId }),
      api.getComments(token, "issue", issueId),
    ]).then(([i, s, c]) => {
      setIssue(i.issue);
      setSubtasks(s.subtasks);
      setComments(c.comments);
    }).catch((err) => setError((err as Error).message));
  };

  useEffect(load, [token, issueId]);

  const saveIssue = async (updates: Partial<Issue>) => {
    if (!token || !issue) return;
    await api.updateIssue(token, issue.id, updates);
    load();
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !commentBody.trim() || !issue) return;
    await api.createComment(token, {
      entity_type: "issue",
      entity_id: issueId,
      body: commentBody,
      workspace_id: issue.workspace_id ?? undefined,
    });
    setCommentBody("");
    load();
  };

  const updateSubtaskSeverity = async (subtask: Subtask, severity: Severity) => {
    if (!token) return;
    await api.updateSubtask(token, subtask.id, { severity });
    setEditingSubtask(null);
    load();
  };

  if (error) return <div className="detail-view error">{error}</div>;
  if (!issue) return <div className="detail-view">Loading issue…</div>;

  return (
    <div className="detail-view">
      <header className="detail-header">
        <div>
          <button type="button" className="link-btn" onClick={onClose}>← Back</button>
          <div className="task-title-row">
            <h2>{issue.title}</h2>
            <SeverityBadge severity={issue.severity ?? "medium"} />
          </div>
        </div>
        <div className="detail-tabs">
          <button type="button" className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button>
          <button type="button" className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity</button>
        </div>
      </header>

      {tab === "details" ? (
        <div className="detail-body">
          <p className="detail-desc">{issue.description || "No description"}</p>
          <div className="detail-meta">
            <span>Status: {issue.status}</span>
            <span>Priority: {issue.priority}</span>
            <label className="inline-edit">
              Severity
              <SeveritySelect
                value={issue.severity ?? "medium"}
                onChange={(severity) => saveIssue({ severity })}
              />
            </label>
          </div>
          <section>
            <h3>Subtasks</h3>
            <ul className="subtask-list">
              {subtasks.map((s) => (
                <li key={s.id} className="subtask-row">
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
        <ActivityTimeline entityType="issue" entityId={issueId} title="Issue activity" />
      )}
    </div>
  );
}
