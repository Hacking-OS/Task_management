import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import type { ActivityLog } from "../types";
import { ActivityItem } from "./ActivityItem";

interface Props {
  entityType?: string;
  entityId?: string;
  workspaceId?: string;
  title?: string;
}

export function ActivityTimeline({ entityType, entityId, workspaceId, title = "Activity" }: Props) {
  const { token } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");

    const load = async () => {
      try {
        if (entityType === "task" && entityId) {
          const { logs } = await api.getTaskActivity(token, entityId);
          setLogs(logs);
        } else if (entityType === "issue" && entityId) {
          const { logs } = await api.getIssueActivity(token, entityId);
          setLogs(logs);
        } else if (workspaceId) {
          const { logs } = await api.getWorkspaceActivity(token, workspaceId);
          setLogs(logs);
        } else {
          const { logs } = await api.getActivityLogs(token, { workspace_id: workspaceId, entity_type: entityType, entity_id: entityId });
          setLogs(logs);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, entityType, entityId, workspaceId]);

  if (loading) return <div className="activity-loading">Loading activity…</div>;
  if (error) return <div className="activity-error">{error}</div>;

  return (
    <section className="activity-timeline">
      <h3>{title}</h3>
      {logs.length === 0 ? (
        <p className="empty">No activity recorded yet.</p>
      ) : (
        <ul className="activity-list">
          {logs.map((log) => (
            <ActivityItem key={log.id} log={log} />
          ))}
        </ul>
      )}
    </section>
  );
}
