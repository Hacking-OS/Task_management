import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useStatuses } from "../../context/StatusContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import { PageHeader } from "../../shared/PageHeader";
import { DashboardSkeleton } from "../../shared/Skeleton";
import { ErrorState } from "../../shared/StateBox";
import { ActivityTimeline } from "../../shared/ActivityTimeline";
import { DashboardCharts } from "../../shared/DashboardCharts";
import type { DashboardStats } from "../../models/types";
import { isHighSeverity, SEVERITIES } from "../../utils/severity";

export function DashboardPage() {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { forEntity } = useStatuses();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getDashboardStats(token, activeWorkspace?.id)
      .then(({ stats: s }) => setStats(s))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, activeWorkspace?.id]);

  const statusColors = useMemo(() => {
    const toMap = (entityType: "task" | "issue" | "subtask") =>
      new Map(forEntity(entityType).map((s) => [s.slug, s.color]));
    return {
      task: toMap("task"),
      issue: toMap("issue"),
      subtask: toMap("subtask"),
    };
  }, [forEntity]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error} />;

  const highSeverityTotal = SEVERITIES.filter(isHighSeverity).reduce((sum, s) => {
    if (!stats) return sum;
    return sum + (stats.severity.tasks[s] ?? 0) + (stats.severity.issues[s] ?? 0) + (stats.severity.subtasks[s] ?? 0);
  }, 0);

  const overallCompletion = stats?.completion.overall.percent ?? 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={activeWorkspace ? `Overview for ${activeWorkspace.name}` : "Select a workspace to get started"}
      />

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Tasks</span>
          <strong className="stat-value">{stats?.totals.tasks ?? 0}</strong>
          <Link to="/tasks">View tasks</Link>
        </div>
        <div className="stat-card">
          <span className="stat-label">Issues</span>
          <strong className="stat-value">{stats?.totals.issues ?? 0}</strong>
          <Link to="/issues">View issues</Link>
        </div>
        <div className="stat-card">
          <span className="stat-label">Subtasks</span>
          <strong className="stat-value">{stats?.totals.subtasks ?? 0}</strong>
          <Link to="/subtasks">View subtasks</Link>
        </div>
        <div className="stat-card stat-card-success">
          <span className="stat-label">Overall completion</span>
          <strong className="stat-value">{overallCompletion}%</strong>
          <span className="muted">{stats?.completion.overall.closed ?? 0} of {stats?.completion.overall.total ?? 0} closed</span>
        </div>
        <div className="stat-card stat-card-alert">
          <span className="stat-label">High severity items</span>
          <strong className="stat-value">{highSeverityTotal}</strong>
          <Link to="/issues?severity=high">Review high priority</Link>
        </div>
      </div>

      {stats && <DashboardCharts stats={stats} statusColors={statusColors} />}

      {activeWorkspace && (
        <ActivityTimeline workspaceId={activeWorkspace.id} title="Recent activity" />
      )}
    </div>
  );
}
