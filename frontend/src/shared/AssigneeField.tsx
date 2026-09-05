/**
 * @deprecated Use `<AssignUsers variant="inline" entityType="..." />` from `./userAssignment`.
 */
import { AssignUsers } from "./userAssignment";
import type { AssignableEntityType } from "./userAssignment";

interface AssigneeFieldProps {
  userIds: string[];
  assignPermission?: string;
  entityType?: AssignableEntityType;
  onAssign: (userIds: string[]) => Promise<void>;
  readOnly?: boolean;
}

export function AssigneeField({ userIds, entityType = "task", onAssign, readOnly }: AssigneeFieldProps) {
  return (
    <AssignUsers
      variant="inline"
      entityType={entityType}
      value={userIds}
      onSave={onAssign}
      readOnly={readOnly}
    />
  );
}

/** @deprecated Use AssignUsers with a single-id array */
export function SingleAssigneeField({
  userId,
  entityType = "task",
  onAssign,
  readOnly,
}: {
  userId: string | null;
  assignPermission?: string;
  entityType?: AssignableEntityType;
  onAssign: (userId: string | null) => Promise<void>;
  readOnly?: boolean;
}) {
  const ids = userId ? [userId] : [];
  return (
    <AssigneeField
      userIds={ids}
      entityType={entityType}
      readOnly={readOnly}
      onAssign={async (next) => onAssign(next[0] ?? null)}
    />
  );
}
