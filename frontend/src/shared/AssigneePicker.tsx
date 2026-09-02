import { useEffect, useMemo, useRef, useState } from "react";
import { useMembers } from "../context/MembersContext";
import { useWorkspace } from "../context/WorkspaceContext";
import type { WorkspaceMember } from "../models/types";
import { UserAvatar } from "./UserAvatar";
import { UserAssignee } from "./UserAssignee";
import { Skeleton } from "./Skeleton";

interface UserMultiSelectProps {
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

function memberForId(
  userId: string,
  getMemberByUserId: (id: string) => WorkspaceMember | undefined
): WorkspaceMember {
  return (
    getMemberByUserId(userId) ?? {
      id: userId,
      user_id: userId,
      workspace_id: "",
      role_id: "",
      role_slug: "",
      joined_at: "",
      username: userId.slice(0, 8),
      email: "",
      role_name: "Member",
    }
  );
}

export function UserMultiSelect({
  value,
  onChange,
  disabled,
  label = "Assignees",
  placeholder = "Search members…",
}: UserMultiSelectProps) {
  const { activeWorkspace } = useWorkspace();
  const { members, loading, getMemberByUserId } = useMembers();
  const [search, setSearch] = useState("");

  const selectedMembers = useMemo(
    () => value.map((id) => memberForId(id, getMemberByUserId)),
    [value, getMemberByUserId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = members;
    if (q) {
      list = members.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.role_name.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aSel = value.includes(a.user_id);
      const bSel = value.includes(b.user_id);
      if (aSel !== bSel) return aSel ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  }, [members, search, value]);

  const toggle = (userId: string) => {
    if (disabled) return;
    if (value.includes(userId)) onChange(value.filter((id) => id !== userId));
    else onChange([...value, userId]);
  };

  const clearAll = () => {
    if (!disabled) onChange([]);
  };

  if (!activeWorkspace) {
    return (
      <div className="user-multiselect user-multiselect-empty-state">
        <span className="user-multiselect-label">{label}</span>
        <p className="muted">Select a workspace to assign members.</p>
      </div>
    );
  }

  return (
    <div className={`user-multiselect${disabled ? " disabled" : ""}`}>
      <div className="user-multiselect-header">
        <span className="user-multiselect-label">{label}</span>
        {value.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} disabled={disabled}>
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
              onClick={() => toggle(m.user_id)}
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
        <p className="muted user-multiselect-empty">No assignees selected — pick from the list below.</p>
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
            {filtered.map((m) => {
              const selected = value.includes(m.user_id);
              return (
                <li key={m.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`user-multiselect-option${selected ? " selected" : ""}`}
                    onClick={() => toggle(m.user_id)}
                    disabled={disabled}
                  >
                    <span className={`user-multiselect-check${selected ? " on" : ""}`} aria-hidden>
                      {selected ? "✓" : ""}
                    </span>
                    <UserAvatar user={m} size="sm" />
                    <span className="user-multiselect-meta">
                      <span className="user-multiselect-name">{m.username}</span>
                      <span className="muted user-multiselect-role">{m.role_name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
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

/** Compact popover picker for detail views (matches assignee-picker CSS). */
export function AssigneePopoverPicker({
  value,
  onChange,
  disabled,
  label = "Assignees",
  placeholder = "Search members…",
}: UserMultiSelectProps) {
  const { activeWorkspace } = useWorkspace();
  const { members, loading } = useMembers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = members;
    if (q) {
      list = members.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.role_name.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aSel = value.includes(a.user_id);
      const bSel = value.includes(b.user_id);
      if (aSel !== bSel) return aSel ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  }, [members, search, value]);

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

  const toggle = (userId: string) => {
    if (disabled) return;
    if (value.includes(userId)) onChange(value.filter((id) => id !== userId));
    else onChange([...value, userId]);
  };

  if (!activeWorkspace) {
    return <span className="muted">Select a workspace to assign members.</span>;
  }

  return (
    <div ref={rootRef} className={`assignee-picker${disabled ? " disabled" : ""}${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="assignee-picker-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <UserAssignee userIds={value} size="sm" unassignedLabel="Assign members…" />
        <span className="assignee-picker-caret" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="assignee-picker-menu" role="listbox" aria-multiselectable="true" aria-label={label}>
          <div className="assignee-picker-menu-head">
            <span className="assignee-picker-menu-title">{label}</span>
            {value.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])} disabled={disabled}>
                Clear ({value.length})
              </button>
            )}
          </div>

          <input
            className="input assignee-picker-search"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled || loading}
            aria-label="Search workspace members"
          />

          <div className="assignee-picker-options">
            {loading ? (
              <div className="assignee-picker-loading">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="sk-multiselect-row" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="muted assignee-picker-empty">
                {members.length === 0 ? "No workspace members loaded." : "No members match your search."}
              </p>
            ) : (
              filtered.map((m) => {
                const selected = value.includes(m.user_id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`assignee-picker-option${selected ? " active" : ""}`}
                    onClick={() => toggle(m.user_id)}
                    disabled={disabled}
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
    </div>
  );
}

/** Multi-select assignee picker for create/edit forms. */
export function AssigneePicker({
  value,
  onChange,
  disabled,
  label = "Assignees",
}: {
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <UserMultiSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      label={label}
      placeholder="Search by name, email, or role…"
    />
  );
}

interface AssigneeSelectProps {
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  includeUnassigned?: boolean;
  includeMe?: boolean;
  currentUserId?: string;
}

export function AssigneeFilterSelect({
  value,
  onChange,
  includeAll = true,
  includeUnassigned = true,
  includeMe = true,
  currentUserId,
}: AssigneeSelectProps) {
  const { members, loading } = useMembers();

  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      {includeAll && <option value="all">All assignees</option>}
      {includeUnassigned && <option value="unassigned">Unassigned</option>}
      {includeMe && currentUserId && <option value="me">Assigned to me</option>}
      {members.map((m) => (
        <option key={m.id} value={m.user_id}>{m.username}</option>
      ))}
    </select>
  );
}

/** Resolve assignee IDs from entity (supports legacy single assignee). */
export function assigneeIdsFrom(entity: { assignee_id?: string | null; assignee_ids?: string[] }): string[] {
  if (entity.assignee_ids?.length) return entity.assignee_ids;
  return entity.assignee_id ? [entity.assignee_id] : [];
}
