import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { PermissionGate } from "../../shared/PermissionGate";
import { api } from "../../services/api";
import type { Issue, Subtask } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { DetailPageSkeleton } from "../../shared/Skeleton";
import { ErrorState } from "../../shared/StateBox";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { StatusBadge } from "../../shared/StatusBadge";
import { AssignUsers, assigneeIdsFrom } from "../../shared/userAssignment";
import { ActivityTimeline } from "../../shared/ActivityTimeline";
import { CommentsSection } from "../../shared/CommentsSection";
import { FileAttachments } from "../../shared/FileAttachments";
import { formatDate } from "../../utils/severity";

export function IssueDetailPage() {
  const { issueId } = useParams<{ issueId: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !issueId) return;
    setLoading(true);
    Promise.all([
      api.getIssue(token, issueId),
      api.getSubtasks(token, { issue_id: issueId }),
    ])
      .then(([i, s]) => { setIssue(i.issue); setSubtasks(s.subtasks); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, issueId]);

  const remove = async () => {
    if (!token || !issueId || !confirm("Delete this issue?")) return;
    try {
      await api.deleteIssue(token, issueId);
      toast.deleted("Issue");
      navigate("/issues");
    } catch (err) {
      toast.fromError(err, "Could not delete issue");
    }
  };

  if (loading) return <DetailPageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!issue) return <ErrorState message="Issue not found." />;

  return (
    <div>
      <PageHeader
        title={issue.title}
        subtitle={`Issue · Updated ${formatDate(issue.updated_at)}`}
        actions={
          <PermissionGate permission="issue.delete">
            <button type="button" className="btn btn-danger" onClick={remove}>Delete</button>
          </PermissionGate>
        }
      />

      <div className="detail-grid">
        <section className="card">
          <h3 className="card-title">Details</h3>
          <dl className="detail-list">
            <div><dt>Status</dt><dd><StatusBadge entityType="issue" slug={issue.status} workspaceId={issue.workspace_id ?? undefined} /></dd></div>
            <div><dt>Severity</dt><dd><SeverityBadge severity={issue.severity} /></dd></div>
            <div><dt>Priority</dt><dd><span className="badge">{issue.priority}</span></dd></div>
            <div className="detail-list-row--stack">
              <dt>Assignees</dt>
              <dd>
                <AssignUsers
                  variant="inline"
                  entityType="issue"
                  value={assigneeIdsFrom(issue)}
                  onSave={async (assignee_ids) => {
                    if (!token) return;
                    const { issue: updated } = await api.updateIssue(token, issue.id, { assignee_ids });
                    setIssue(updated);
                  }}
                />
              </dd>
            </div>
          </dl>
          <h4>Description</h4>
          <p>{issue.description || "No description."}</p>
        </section>

        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Subtasks ({subtasks.length})</h3>
            <Link to={`/subtasks?issue_id=${issue.id}`}>Manage</Link>
          </div>
          <ul className="mini-list">
            {subtasks.map((s) => (
              <li key={s.id}>
                <span>{s.title}</span>
                <AssignUsers variant="display" userIds={assigneeIdsFrom(s)} showName={false} size="xs" />
                <SeverityBadge severity={s.severity} compact />
                <StatusBadge entityType="subtask" slug={s.status} workspaceId={issue.workspace_id ?? undefined} compact />
              </li>
            ))}
            {subtasks.length === 0 && <li className="muted">No subtasks</li>}
          </ul>
        </section>
      </div>

      {issue.workspace_id && (
        <FileAttachments
          workspaceId={issue.workspace_id}
          category="issue"
          entityId={issue.id}
          uploadPermission="issue.edit"
        />
      )}

      <CommentsSection entityType="issue" entityId={issue.id} workspaceId={issue.workspace_id ?? undefined} />
      <ActivityTimeline entityType="issue" entityId={issue.id} title="Activity history" />
    </div>
  );
}
