import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PermissionGate } from "./PermissionGate";
import { AssigneePopoverPicker } from "./AssigneePicker";
import { UserAssignee } from "./UserAssignee";

interface AssigneeFieldProps {
  userIds: string[];
  assignPermission: string;
  onAssign: (userIds: string[]) => Promise<void>;
  readOnly?: boolean;
}

export function AssigneeField({ userIds, assignPermission, onAssign, readOnly }: AssigneeFieldProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = async (next: string[]) => {
    if (!token) return;
    const same = next.length === userIds.length && next.every((id) => userIds.includes(id));
    if (same) return;
    setSaving(true);
    setError("");
    try {
      await onAssign(next);
      toast.patched("Assignees");
    } catch (err) {
      toast.fromError(err, "Could not update assignees");
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) return <UserAssignee userIds={userIds} />;

  return (
    <PermissionGate permission={assignPermission} fallback={<UserAssignee userIds={userIds} />}>
      <div className="assignee-field">
        <AssigneePopoverPicker value={userIds} onChange={handleChange} disabled={saving} label="Assignees" />
        {saving && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </PermissionGate>
  );
}

/** Single assignee field (legacy) */
export function SingleAssigneeField({
  userId,
  assignPermission,
  onAssign,
  readOnly,
}: {
  userId: string | null;
  assignPermission: string;
  onAssign: (userId: string | null) => Promise<void>;
  readOnly?: boolean;
}) {
  const ids = userId ? [userId] : [];
  return (
    <AssigneeField
      userIds={ids}
      assignPermission={assignPermission}
      readOnly={readOnly}
      onAssign={async (next) => onAssign(next[0] ?? null)}
    />
  );
}
