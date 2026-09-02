import type { StatusEntityType } from "../models/types";
import { useStatuses } from "../context/StatusContext";
import { contrastTextColor, statusFallbackLabel } from "../utils/statusColor";

interface StatusBadgeProps {
  entityType: StatusEntityType;
  slug: string;
  workspaceId?: string;
  compact?: boolean;
}

export function StatusBadge({ entityType, slug, workspaceId, compact }: StatusBadgeProps) {
  const { getStatus } = useStatuses();
  const status = getStatus(entityType, slug, workspaceId);
  const color = status?.color ?? "#64748b";
  const label = status?.label ?? statusFallbackLabel(slug);

  return (
    <span
      className={`status-badge${compact ? " status-badge-compact" : ""}`}
      style={{ backgroundColor: color, color: contrastTextColor(color), borderColor: `${color}33` }}
    >
      {label}
    </span>
  );
}
