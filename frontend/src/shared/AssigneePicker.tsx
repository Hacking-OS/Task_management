/**
 * @deprecated Import from `./userAssignment` instead.
 * Thin compatibility layer for legacy assignee imports.
 */
export {
  AssignUsers,
  AssignUsersField,
  assigneeIdsFrom,
  assignPermissionFor,
  useMemberPicker,
  ASSIGN_PERMISSION,
} from "./userAssignment";
export type { AssignableEntityType, AssignUsersProps } from "./userAssignment";

import { AssignUsers } from "./userAssignment";
import type { AssignableEntityType } from "./userAssignment";

/** @deprecated Use `<AssignUsers variant="form" />` or `<AssignUsersField />` */
export function AssigneePicker({
  value,
  onChange,
  disabled,
  label = "Assignees",
  entityType = "task",
}: {
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  entityType?: AssignableEntityType;
}) {
  return (
    <AssignUsers
      variant="form"
      entityType={entityType}
      value={value}
      onChange={onChange}
      disabled={disabled}
      label={label}
    />
  );
}

/** @deprecated Use `<AssignUsers variant="filter" />` */
export function AssigneeFilterSelect(props: {
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  includeUnassigned?: boolean;
  includeMe?: boolean;
  currentUserId?: string;
}) {
  return <AssignUsers variant="filter" {...props} />;
}

/** @deprecated Use `<AssignUsers variant="inline" />` */
export function AssigneePopoverPicker(props: {
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  entityType?: AssignableEntityType;
  onSave?: (userIds: string[]) => Promise<void>;
}) {
  const { onChange, onSave, entityType = "task", ...rest } = props;
  return (
    <AssignUsers
      variant="inline"
      entityType={entityType}
      value={rest.value}
      onSave={onSave ?? (async (ids) => onChange(ids))}
      label={rest.label}
    />
  );
}
