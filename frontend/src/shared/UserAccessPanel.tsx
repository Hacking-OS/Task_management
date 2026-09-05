import { useMemo, useState } from "react";
import { usePermissions } from "../context/PermissionsContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";

function overrideCount(overrides?: { grants: string[]; denies: string[] }): number {
  if (!overrides) return 0;
  return overrides.grants.length + overrides.denies.length;
}

interface UserAccessPanelProps {
  /** When set, show this member's access instead of the logged-in user. */
  member?: {
    username: string;
    role_name: string;
    role_slug: string;
    effective_permissions?: string[];
    permission_overrides?: { grants: string[]; denies: string[] };
    permissions_hidden?: boolean;
  };
  compact?: boolean;
  /** Override workspace label (e.g. when viewing a specific workspace's permissions page). */
  workspaceName?: string;
}

export function UserAccessPanel({ member, compact = false, workspaceName: workspaceNameProp }: UserAccessPanelProps) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { permissions, roleName, roleSlug, isOwner, loading, workspaceName: ctxWorkspaceName } = usePermissions();
  const [expanded, setExpanded] = useState(false);
  const workspaceLabel = workspaceNameProp ?? ctxWorkspaceName ?? activeWorkspace?.name ?? "this workspace";

  const subject = member ?? {
    username: user?.username ?? "You",
    role_name: roleName ?? "—",
    role_slug: roleSlug ?? "",
    effective_permissions: permissions,
    permission_overrides: undefined as { grants: string[]; denies: string[] } | undefined,
  };

  const effective = subject.effective_permissions ?? [];
  const customizations = overrideCount(subject.permission_overrides);

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const code of effective) {
      const group = code.split(".")[0] ?? "other";
      const list = map.get(group) ?? [];
      list.push(code);
      map.set(group, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [effective]);

  if (loading && !member) {
    return (
      <section className="card user-access-panel">
        <p className="muted">Loading your permissions…</p>
      </section>
    );
  }

  if (member?.permissions_hidden) {
    return (
      <section className={`card user-access-panel${compact ? " compact" : ""}`}>
        <div className="user-access-head">
          <div>
            <h3 className="card-title">{member.username}&apos;s access</h3>
            <p className="muted">Workspace owner permissions are private and not visible to other members.</p>
          </div>
          <div className="user-access-badges">
            <span className="badge">{member.role_name}</span>
            <span className="badge badge-muted">Hidden</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`card user-access-panel${compact ? " compact" : ""}`}>
      <div className="user-access-head">
        <div>
          <h3 className="card-title">
            {member ? `${subject.username}'s access` : "Your access"}
            <span className="workspace-scope-label"> in {workspaceLabel}</span>
          </h3>
          <p className="muted">
            Roles and permissions are scoped to each workspace. This view reflects membership in <strong>{workspaceLabel}</strong> only — not your access in other workspaces.
          </p>
        </div>
        <div className="user-access-badges">
          <span className="badge">{subject.role_name}</span>
          {isOwner && !member && <span className="badge badge-success">Owner</span>}
          <span className="badge">{effective.length} permissions</span>
          {customizations > 0 && (
            <span className="badge badge-warning">{customizations} custom override{customizations === 1 ? "" : "s"}</span>
          )}
        </div>
      </div> 

      {!compact && (
        <>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide permissions" : "Show effective permissions"}
          </button>
          {expanded && (
            <div className="user-access-groups">
              {grouped.length === 0 ? (
                <p className="muted">No permissions assigned.</p>
              ) : (
                grouped.map(([group, codes]) => (
                  <div key={group} className="user-access-group">
                    <strong>{group}</strong>
                    <ul className="perm-code-list">
                      {codes.map((code) => (
                        <li key={code}>
                          <code>{code}</code>
                          {subject.permission_overrides?.grants.includes(code) && (
                            <span className="perm-tag grant">granted</span>
                          )}
                          {subject.permission_overrides?.denies.includes(code) && (
                            <span className="perm-tag deny">denied</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function memberOverrideLabel(member: {
  permission_overrides?: { grants: string[]; denies: string[] };
  effective_permissions?: string[];
  permissions_hidden?: boolean;
  role_slug?: string;
  role_name?: string;
}, roleName?: string): string {
  if (member.permissions_hidden) {
    return "Permissions hidden";
  }
  const label = roleName ?? member.role_name;
  const count = member.effective_permissions?.length ?? 0;
  const overrides = overrideCount(member.permission_overrides);
  const rolePrefix = label ? `${label} · ` : "";
  if (overrides > 0) return `${rolePrefix}${count} perms · ${overrides} override${overrides === 1 ? "" : "s"}`;
  return `${rolePrefix}${count} permissions`;
}
