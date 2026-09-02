import type { StatusEntityType } from "../models/types";
import { useStatuses } from "../context/StatusContext";
import { StatusBadge } from "./StatusBadge";

interface StatusSelectProps {
  entityType: StatusEntityType;
  value: string;
  onChange: (slug: string) => void;
  className?: string;
  includeAll?: boolean;
  allLabel?: string;
  workspaceId?: string;
  showPreview?: boolean;
}

export function StatusSelect({
  entityType,
  value,
  onChange,
  className = "select",
  includeAll,
  allLabel = "All statuses",
  workspaceId,
  showPreview = true,
}: StatusSelectProps) {
  const { forEntity } = useStatuses();
  const options = forEntity(entityType);

  return (
    <div className="colored-select-wrap">
      {showPreview && value !== "all" && (
        <StatusBadge entityType={entityType} slug={value} workspaceId={workspaceId} compact />
      )}
      <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
        {includeAll && <option value="all">{allLabel}</option>}
        {options.length > 0 ? (
          options.map((s) => (
            <option key={s.id} value={s.slug}>{s.label}</option>
          ))
        ) : (
          <>
            {entityType === "task" && (
              <>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </>
            )}
            {entityType === "issue" && (
              <>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </>
            )}
            {entityType === "subtask" && (
              <>
                <option value="todo">To Do</option>
                <option value="done">Done</option>
              </>
            )}
          </>
        )}
      </select>
    </div>
  );
}
