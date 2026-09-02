import type { ActivityLog } from "../types";
import { formatTimestamp } from "../utils/notifications";

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

  return (
    <li className="activity-item">
      <div className="activity-dot" />
      <div className="activity-body">
        <p>{log.description}</p>
        <span className="activity-meta">
          {log.action} · {log.entity_type}
          {Object.keys(meta).length > 0 && ` · ${JSON.stringify(meta)}`}
        </span>
        <time>{formatTimestamp(log.created_at)}</time>
      </div>
    </li>
  );
}
