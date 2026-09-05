import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useMembers } from "../../context/MembersContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PermissionGate } from "../PermissionGate";
import { Skeleton } from "../Skeleton";
import { UserAvatar } from "../UserAvatar";
import { UserAssignee } from "../UserAssignee";
import { useMemberPicker } from "./useMemberPicker";
import type { AssignableEntityType } from "./types";
import { assignPermissionFor } from "./utils";

type DisplayProps = {
  variant: "display";
  userIds?: string[];
  userId?: string | null;
  showName?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  unassignedLabel?: string;
};

type FilterProps = {
  variant: "filter";
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  includeUnassigned?: boolean;
  includeMe?: boolean;
  currentUserId?: string;
};

type FormProps = {
  variant: "form";
  entityType: AssignableEntityType;
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
};

type InlineProps = {
  variant: "inline";
  entityType: AssignableEntityType;
  value: string[];
  onSave: (userIds: string[]) => Promise<void>;
  readOnly?: boolean;
  label?: string;
  placeholder?: string;
};

export type AssignUsersProps = DisplayProps | FilterProps | FormProps | InlineProps;

function MemberOptionRow({
  member,
  selected,
  disabled,
  onToggle,
}: {
  member: { id: string; user_id: string; username: string; role_name: string };
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`user-multiselect-option${selected ? " selected" : ""}`}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className={`user-multiselect-check${selected ? " on" : ""}`} aria-hidden>
        {selected ? "✓" : ""}
      </span>
      <UserAvatar user={member} size="sm" />
      <span className="user-multiselect-meta">
        <span className="user-multiselect-name">{member.username}</span>
        <span className="muted user-multiselect-role">{member.role_name}</span>
      </span>
    </button>
  );
}

function AssignUsersForm({
  value,
  onChange,
  disabled,
  label = "Assignees",
  placeholder = "Search by name, email, or role…",
}: {
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const { activeWorkspace } = useWorkspace();
  const { members, loading, search, setSearch, selectedMembers, filteredMembers, toggleUser, clearAll } = useMemberPicker(value);

  if (!activeWorkspace) {
    return (
      <div className="user-multiselect user-multiselect-empty-state">
        <span className="user-multiselect-label">{label}</span>
        <p className="muted">Select a workspace to assign members from that workspace only.</p>
      </div>
    );
  }

  return (
    <div className={`user-multiselect${disabled ? " disabled" : ""}`}>
      <div className="user-multiselect-header">
        <span className="user-multiselect-label">{label}</span>
        <span className="muted workspace-assign-scope">Members of {activeWorkspace.name}</span>
        {value.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => clearAll(onChange, disabled)} disabled={disabled}>
            Clear all ({value.length})
          </button>
        )}
      </div>

      {selectedMembers.length > 0 ? (
        <div className="user-multiselect-selected">
          {selectedMembers.map((m) => (
            <button
              key={m.user_id}
              type="button"
              className="user-multiselect-chip"
              onClick={() => toggleUser(m.user_id, onChange, disabled)}
              disabled={disabled}
              title={`Remove ${m.username}`}
            >
              <UserAvatar user={m} size="xs" />
              <span className="user-multiselect-chip-name">{m.username}</span>
              <span className="chip-remove" aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted user-multiselect-empty">No assignees selected — pick workspace members below.</p>
      )}

      <input
        className="input user-multiselect-search"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled || loading}
        aria-label="Search workspace members"
      />

      <div className="user-multiselect-list-wrap">
        {loading ? (
          <div className="user-multiselect-loading">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="sk-multiselect-row" />
            ))}
          </div>
        ) : (
          <ul className="user-multiselect-list" role="listbox" aria-multiselectable="true" aria-label={label}>
            {filteredMembers.map((m) => (
              <li key={m.id}>
                <MemberOptionRow
                  member={m}
                  selected={value.includes(m.user_id)}
                  disabled={disabled}
                  onToggle={() => toggleUser(m.user_id, onChange, disabled)}
                />
              </li>
            ))}
            {filteredMembers.length === 0 && (
              <li className="muted user-multiselect-no-results">
                {members.length === 0 ? "No workspace members loaded." : "No members match your search."}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function AssignUsersInline({
  entityType,
  value,
  onSave,
  readOnly,
  label = "Assignees",
  placeholder = "Search members…",
}: Omit<InlineProps, "variant">) {
  const { token } = useAuth();
  const toast = useToast();
  const { activeWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const assignPermission = assignPermissionFor(entityType);
  const { loading, search, setSearch, filteredMembers } = useMemberPicker(value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleChange = async (next: string[]) => {
    if (!token) return;
    const same = next.length === value.length && next.every((id) => value.includes(id));
    if (same) return;
    setSaving(true);
    setError("");
    try {
      await onSave(next);
      toast.patched("Assignees");
    } catch (err) {
      toast.fromError(err, "Could not update assignees");
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) return <UserAssignee userIds={value} />;

  if (!activeWorkspace) {
    return <span className="muted">Select a workspace to assign members.</span>;
  }

  const picker = (
    <div ref={rootRef} className={`assignee-picker${saving ? " disabled" : ""}${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="assignee-picker-trigger"
        onClick={() => !saving && setOpen((current) => !current)}
        disabled={saving}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <UserAssignee userIds={value} size="sm" unassignedLabel="Assign members…" />
        <span className="assignee-picker-caret" aria-hidden>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="assignee-picker-menu" role="listbox" aria-multiselectable="true" aria-label={label}>
          <div className="assignee-picker-menu-head">
            <span className="assignee-picker-menu-title">{label}</span>
            {value.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleChange([])} disabled={saving}>
                Clear ({value.length})
              </button>
            )}
          </div>

          <input
            className="input assignee-picker-search"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={saving || loading}
            aria-label="Search workspace members"
          />

          <div className="assignee-picker-options">
            {loading ? (
              <div className="assignee-picker-loading">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="sk-multiselect-row" />
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <p className="muted assignee-picker-empty">No members match your search.</p>
            ) : (
              filteredMembers.map((m) => {
                const selected = value.includes(m.user_id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`assignee-picker-option${selected ? " active" : ""}`}
                    onClick={() => {
                      const next = selected ? value.filter((id) => id !== m.user_id) : [...value, m.user_id];
                      void handleChange(next);
                    }}
                    disabled={saving}
                  >
                    <span className={`user-multiselect-check${selected ? " on" : ""}`} aria-hidden>
                      {selected ? "✓" : ""}
                    </span>
                    <UserAvatar user={m} size="sm" />
                    <span className="assignee-picker-option-meta">
                      <span className="assignee-picker-option-name">{m.username}</span>
                      <span className="muted assignee-role">{m.role_name}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      {saving && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );

  return (
    <PermissionGate permission={assignPermission} fallback={<UserAssignee userIds={value} />}>
      <div className="assignee-field">{picker}</div>
    </PermissionGate>
  );
}

function AssignUsersFilter({
  value,
  onChange,
  includeAll = true,
  includeUnassigned = true,
  includeMe = true,
  currentUserId,
}: Omit<FilterProps, "variant">) {
  const { members, loading } = useMembers();

  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} aria-label="Filter by assignee">
      {includeAll && <option value="all">All assignees</option>}
      {includeUnassigned && <option value="unassigned">Unassigned</option>}
      {includeMe && currentUserId && <option value="me">Assigned to me</option>}
      {members.map((m) => (
        <option key={m.id} value={m.user_id}>{m.username} ({m.role_name})</option>
      ))}
    </select>
  );
}

/** Centralized user assignment UI — form, inline, filter, and display modes. */
export function AssignUsers(props: AssignUsersProps) {
  if (props.variant === "display") {
    return (
      <UserAssignee
        userId={props.userId}
        userIds={props.userIds}
        showName={props.showName}
        size={props.size}
        unassignedLabel={props.unassignedLabel}
      />
    );
  }

  if (props.variant === "filter") {
    return <AssignUsersFilter {...props} />;
  }

  if (props.variant === "form") {
    return (
      <AssignUsersForm
        value={props.value}
        onChange={props.onChange}
        disabled={props.disabled}
        label={props.label}
        placeholder={props.placeholder}
      />
    );
  }

  return <AssignUsersInline {...props} />;
}

/** Form field wrapper with label row used across create/edit pages. */
export function AssignUsersField({
  entityType,
  value,
  onChange,
  disabled,
  label = "Assignees",
  error,
}: {
  entityType: AssignableEntityType;
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  error?: string;
}) {
  return (
    <div className={`form-field-assignees${error ? " has-error" : ""}`}>
      <span>{label}</span>
      <AssignUsers variant="form" entityType={entityType} value={value} onChange={onChange} disabled={disabled} label={label} />
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}
