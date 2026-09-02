import type { ActivityLog } from "../models/types";
import { formatDate } from "../utils/severity";

interface Props {
  log: ActivityLog;
}

export function ActivityItem({ log }: Props) {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(log.metadata || "{}");
  } catch {
    meta = {};
  }

  const severityChange =
    log.action === "severity_changed" &&
    typeof meta.old_severity === "string" &&
    typeof meta.new_severity === "string";

  const actionLabels: Record<string, string> = {
    created: "Created",
    updated: "Updated",
    deleted: "Deleted",
    status_changed: "Status",
    priority_changed: "Priority",
    assignment_changed: "Assignment",
    assignees_updated: "Assignees",
    completed: "Completed",
    severity_changed: "Severity",
    comment_added: "Comment",
    comment_deleted: "Comment removed",
    file_uploaded: "File attached",
    file_deleted: "File removed",
  };
  const actionLabel = actionLabels[log.action] ?? log.action.replace(/_/g, " ");

  return (
    <li className="activity-row">
      <div className="activity-dot" />
      <div className="activity-content">
        <p className="activity-desc">{log.description}</p>
        {severityChange && (
          <p className="activity-severity-change">
            {meta.old_severity as string} → {meta.new_severity as string}
          </p>
        )}
        <div className="activity-meta">
          <span>{actionLabel}</span>
          <span>{log.entity_type}</span>
          <time>{formatDate(log.created_at)}</time>
        </div>
      </div>
    </li>
  );
}
