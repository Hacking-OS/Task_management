import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { DashboardStats, Issue, Task, WorkspaceFile, WorkspaceOverviewStats } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { DetailPageSkeleton } from "../../shared/Skeleton";
import { ErrorState } from "../../shared/StateBox";
import { ActivityTimeline } from "../../shared/ActivityTimeline";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { StatusBadge } from "../../shared/StatusBadge";
import { Icon } from "../../shared/icons/Icon";
import { formatDate } from "../../utils/severity";

export function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const { workspaces, setActive, activeWorkspace } = useWorkspace();
  const { hasPermission } = usePermissions();
  const { notifications: sharedNotifications } = useNotifications();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const isActiveWorkspace = workspaceId === activeWorkspace?.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const recentNotifications = useMemo(
    () =>
      isActiveWorkspace
        ? sharedNotifications.filter((n) => n.workspace_id === workspaceId || n.workspace_id == null).slice(0, 5)
        : [],
    [isActiveWorkspace, sharedNotifications, workspaceId]
  );

  useEffect(() => {
    if (!token || !workspaceId) return;
    setLoading(true);
    Promise.all([
      api.getDashboardStats(token, workspaceId),
      api.getTasks(token, workspaceId),
      api.getIssues(token, workspaceId),
      api.listFiles(token, workspaceId).catch(() => ({ files: [] as WorkspaceFile[] })),
      api.getWorkspaceOverview(token, workspaceId).catch(() => ({ overview: null })),
    ])
      .then(([dashboard, t, i, f, ov]) => {
        setStats(dashboard.stats);
        setTasks(t.tasks);
        setIssues(i.issues);
        setFiles(f.files);
        setOverview(ov.overview);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [token, workspaceId]);

  if (loading) return <DetailPageSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!workspace) return <ErrorState message="Workspace not found." />;

  const criticalIssues = issues.filter((i) => i.severity === "critical");

  return (
    <div>
      <PageHeader
        title={workspace.name}
        subtitle={workspace.description || "Workspace overview"}
        actions={
          <div className="form-actions" style={{ margin: 0 }}>
            {hasPermission("member.view") && (
              <Link to={`/workspaces/${workspace.id}/permissions`} className="btn btn-secondary">
                Roles & Permissions
              </Link>
            )}
            {hasPermission("project.view") && (
              <Link to="/projects" className="btn btn-secondary">
                Projects
              </Link>
            )}
            {workspace.is_active ? (
              <span className="badge badge-success">Active</span>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setActive(workspace.id)}>Activate</button>
            )}
          </div>
        }
      />

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-label">Tasks</span><strong>{stats?.totals.tasks ?? tasks.length}</strong></div>
        <div className="stat-card"><span className="stat-label">Issues</span><strong>{stats?.totals.issues ?? issues.length}</strong></div>
        <div className="stat-card"><span className="stat-label">Files</span><strong>{files.length}</strong></div>
        <div className="stat-card stat-card-alert"><span className="stat-label">Critical issues</span><strong>{criticalIssues.length}</strong></div>
      </div>

      {overview && (
        <div className="stat-grid">
          <div className="stat-card"><span className="stat-label">Projects</span><strong>{overview.active_project_count} / {overview.project_count}</strong></div>
          <div className="stat-card"><span className="stat-label">Teams</span><strong>{overview.team_count}</strong></div>
          <div className="stat-card"><span className="stat-label">Members</span><strong>{overview.member_count}</strong></div>
          <div className="stat-card"><span className="stat-label">Pending approvals</span><strong>{overview.pending_approval_count}</strong></div>
          <div className="stat-card"><span className="stat-label">Team join requests</span><strong>{overview.pending_team_request_count}</strong></div>
        </div>
      )}

      <div className="two-col">
        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Recent tasks</h3>
            <Link to="/tasks">All tasks</Link>
          </div>
          <ul className="mini-list">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                <SeverityBadge severity={t.severity} compact />
                <StatusBadge entityType="task" slug={t.status} workspaceId={workspaceId} compact />
              </li>
            ))}
            {tasks.length === 0 && <li className="muted">No tasks</li>}
          </ul>
        </section>

        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Critical issues</h3>
            <Link to="/issues?severity=critical">View all</Link>
          </div>
          <ul className="mini-list">
            {criticalIssues.slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link to={`/issues/${i.id}`}>{i.title}</Link>
                <SeverityBadge severity={i.severity} compact />
                <StatusBadge entityType="issue" slug={i.status} workspaceId={workspaceId} compact />
              </li>
            ))}
            {criticalIssues.length === 0 && <li className="muted">No critical issues</li>}
          </ul>
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Files</h3>
            <Link to="/files">Browse files</Link>
          </div>
          <ul className="mini-list">
            {files.slice(0, 8).map((f) => (
              <li key={f.id}>
                <span className="file-row-icon">
                  <Icon name="file" size={16} />
                  {f.filename}
                </span>
              </li>
            ))}
            {files.length === 0 && <li className="muted">No uploaded files yet</li>}
          </ul>
        </section>

        <section className="card">
          <div className="card-header-row">
            <h3 className="card-title">Recent notifications</h3>
            <Link to="/notifications">View all</Link>
          </div>
          <ul className="mini-list">
            {recentNotifications.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                <time className="muted">{formatDate(n.created_at)}</time>
              </li>
            ))}
            {recentNotifications.length === 0 && <li className="muted">No notifications</li>}
          </ul>
        </section>
      </div>

      <ActivityTimeline workspaceId={workspace.id} title="Recent activity" />
    </div>
  );
}
