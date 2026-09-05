import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { PermissionGate } from "../../shared/PermissionGate";
import { api } from "../../services/api";
import type { Subtask, Task } from "../../models/types";
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

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    if (!token || !taskId) return;
    setLoading(true);
    Promise.all([
      api.getTask(token, taskId),
      api.getSubtasks(token, { task_id: taskId }),
    ])
      .then(async ([t, s]) => {
        setTask(t.task);
        setSubtasks(s.subtasks);
        if (t.task.workspace_id) {
          const { stats } = await api.getDashboardStats(token, t.task.workspace_id);
          setIssueCount(stats.totals.issues);
        } else {
          setIssueCount(0);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, taskId]);

  const remove = async () => {
    if (!token || !taskId || !confirm("Delete this task?")) return;
    try {
      await api.deleteTask(token, taskId);
      toast.deleted("Task");
      navigate("/tasks");
    } catch (err) {
      toast.fromError(err, "Could not delete task");
    }
  };

  if (loading) return <DetailPageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!task) return <ErrorState message="Task not found." />;

  return (
    <div>
      <PageHeader
        title={task.title}
        subtitle={`Task · Updated ${formatDate(task.updated_at)}`}
        actions={
          <>
            <PermissionGate permission="task.edit">
              <Link to={`/tasks/${task.id}/edit`} className="btn btn-secondary">Edit</Link>
            </PermissionGate>
            <PermissionGate permission="task.delete">
              <button type="button" className="btn btn-danger" onClick={remove}>Delete</button>
            </PermissionGate>
          </>
        }
      />

      <div className="detail-grid">
        <section className="card">
          <h3 className="card-title">Details</h3>
          <dl className="detail-list">
            <div><dt>Status</dt><dd><StatusBadge entityType="task" slug={task.status} workspaceId={task.workspace_id ?? undefined} /></dd></div>
            <div><dt>Severity</dt><dd><SeverityBadge severity={task.severity} /></dd></div>
            <div><dt>Priority</dt><dd><span className="badge">{task.priority}</span></dd></div>
            <div className="detail-list-row--stack">
              <dt>Assignees</dt>
              <dd>
                <AssignUsers
                  variant="inline"
                  entityType="task"
                  value={assigneeIdsFrom(task)}
                  onSave={async (assignee_ids) => {
                    if (!token) return;
                    const { task: updated } = await api.updateTask(token, task.id, { assignee_ids });
                    setTask(updated);
                  }}
                />
              </dd>
            </div>
            <div><dt>Due date</dt><dd>{task.due_date ? formatDate(task.due_date) : "—"}</dd></div>
          </dl>
          <h4>Description</h4>
          <p>{task.description || "No description."}</p>
        </section>

        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Subtasks ({subtasks.length})</h3>
            <Link to={`/subtasks?task_id=${task.id}`}>Manage</Link>
          </div>
          <ul className="mini-list">
            {subtasks.map((s) => (
              <li key={s.id}>
                <span>{s.title}</span>
                <AssignUsers variant="display" userIds={assigneeIdsFrom(s)} showName={false} size="xs" />
                <SeverityBadge severity={s.severity} compact />
                <StatusBadge entityType="subtask" slug={s.status} workspaceId={task.workspace_id ?? undefined} compact />
              </li>
            ))}
            {subtasks.length === 0 && <li className="muted">No subtasks</li>}
          </ul>
        </section>

        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Workspace issues ({issueCount})</h3>
            <Link to="/issues">View all</Link>
          </div>
          <p className="muted">Open the issues list to browse workspace issues linked to this task context.</p>
        </section>
      </div>

      {task.workspace_id && (
        <FileAttachments
          workspaceId={task.workspace_id}
          category="task"
          entityId={task.id}
          uploadPermission="task.edit"
        />
      )}

      <CommentsSection entityType="task" entityId={task.id} workspaceId={task.workspace_id ?? undefined} />
      <ActivityTimeline entityType="task" entityId={task.id} title="Activity timeline" />
    </div>
  );
}
