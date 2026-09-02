import { useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PageHeader } from "../../shared/PageHeader";
import { EmptyState } from "../../shared/StateBox";
import { ActivityTimeline } from "../../shared/ActivityTimeline";

export function ActivityPage() {
  const { activeWorkspace } = useWorkspace();
  const [entityType, setEntityType] = useState("");

  if (!activeWorkspace) return <EmptyState message="Select or create a workspace to continue." />;

  return (
    <div>
      <PageHeader title="Activity" subtitle={`Timeline for ${activeWorkspace.name}`} />
      <div className="filters-bar card">
        <select className="select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entity types</option>
          <option value="task">Tasks</option>
          <option value="issue">Issues</option>
          <option value="subtask">Subtasks</option>
          <option value="workspace">Workspace</option>
        </select>
      </div>
      <ActivityTimeline
        workspaceId={activeWorkspace.id}
        entityType={entityType || undefined}
        title="Workspace activity"
      />
    </div>
  );
}
