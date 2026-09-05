import { Fragment } from "react";
import type { Permission, WorkspaceRole } from "../../models/types";

interface PermissionMatrixTableProps {
  permissions: Permission[];
  roles: WorkspaceRole[];
  editable: boolean;
  onToggle: (roleId: string, permissionCode: string, enabled: boolean) => void;
  savingRoleId?: string | null;
}

export function PermissionMatrixTable({ permissions, roles, editable, onToggle, savingRoleId }: PermissionMatrixTableProps) {
  const groups = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="permission-matrix-wrap">
      <table className="permission-matrix">
        <thead>
          <tr>
            <th className="perm-col-label">Permission</th>
            {roles.map((role) => (
              <th key={role.id} className="perm-col-role">
                <span className="perm-role-name">{role.name}</span>
                {role.permissions_hidden ? (
                  <span className="perm-role-tag perm-role-hidden">Hidden</span>
                ) : role.is_system ? (
                  <span className="perm-role-tag">System</span>
                ) : null}
                {savingRoleId === role.id ? <span className="perm-saving">Saving…</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groups).map(([group, perms]) => (
            <Fragment key={group}>
              <tr key={`group-${group}`} className="perm-group-row">
                <td colSpan={roles.length + 1}>{group}</td>
              </tr>
              {perms.map((perm) => (
                <tr key={perm.code}>
                  <td className="perm-label-cell">
                    <strong>{perm.name}</strong>
                    <span className="perm-desc">{perm.description}</span>
                  </td>
                  {roles.map((role) => {
                    const ownerHidden = role.permissions_hidden === true;
                    const enabled = !ownerHidden && (role.permissions ?? []).includes(perm.code);
                    const locked = !editable || role.slug === "owner" || ownerHidden;
                    return (
                      <td key={`${role.id}-${perm.code}`} className="perm-check-cell">
                        {ownerHidden ? (
                          <span className="perm-hidden-mark" title="Owner permissions are private">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={locked}
                            aria-label={`${perm.name} for ${role.name}`}
                            onChange={(e) => onToggle(role.id, perm.code, e.target.checked)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SingleRolePermissionEditorProps {
  permissions: Permission[];
  role: WorkspaceRole;
  editable: boolean;
  onToggle: (roleId: string, permissionCode: string, enabled: boolean) => void;
  savingRoleId?: string | null;
}

/** Edit permissions for one role (e.g. from a selected user's role). */
export function SingleRolePermissionEditor({
  permissions,
  role,
  editable,
  onToggle,
  savingRoleId,
}: SingleRolePermissionEditorProps) {
  return (
    <PermissionMatrixTable
      permissions={permissions}
      roles={[role]}
      editable={editable}
      savingRoleId={savingRoleId}
      onToggle={onToggle}
    />
  );
}

function buildOverrides(rolePerms: string[], desired: Set<string>, allCodes: string[]) {
  const roleSet = new Set(rolePerms);
  const overrides: { permission_code: string; effect: "grant" | "deny" }[] = [];
  for (const code of allCodes) {
    const inRole = roleSet.has(code);
    const inDesired = desired.has(code);
    if (inDesired && !inRole) overrides.push({ permission_code: code, effect: "grant" });
    else if (!inDesired && inRole) overrides.push({ permission_code: code, effect: "deny" });
  }
  return overrides;
}

interface MemberPermissionEditorProps {
  permissions: Permission[];
  rolePermissions: string[];
  effectivePermissions: string[];
  overrides: { grants: string[]; denies: string[] };
  editable: boolean;
  onSave: (overrides: { permission_code: string; effect: "grant" | "deny" }[]) => Promise<void>;
  onReset: () => Promise<void>;
  saving: boolean;
}

export function MemberPermissionEditor({
  permissions,
  rolePermissions,
  effectivePermissions,
  overrides,
  editable,
  onSave,
  onReset,
  saving,
}: MemberPermissionEditorProps) {
  const allCodes = permissions.map((p) => p.code);
  const effectiveSet = new Set(effectivePermissions);
  const hasOverrides = overrides.grants.length > 0 || overrides.denies.length > 0;

  const toggle = async (code: string, enabled: boolean) => {
    const next = new Set(effectiveSet);
    if (enabled) next.add(code);
    else next.delete(code);
    await onSave(buildOverrides(rolePermissions, next, allCodes));
  };

  const groups = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="member-perm-editor">
      {hasOverrides && (
        <div className="member-perm-banner">
          <span>This member has custom permission overrides.</span>
          {editable && (
            <button type="button" className="btn btn-sm btn-secondary" disabled={saving} onClick={onReset}>
              Reset to role defaults
            </button>
          )}
        </div>
      )}
      <div className="permission-matrix-wrap">
        <table className="permission-matrix member-perm-table">
          <thead>
            <tr>
              <th>Permission</th>
              <th>From role</th>
              <th>Effective</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, perms]) => (
              <Fragment key={`mg-${group}`}>
                <tr className="perm-group-row">
                  <td colSpan={3}>{group}</td>
                </tr>
                {perms.map((perm) => {
                  const fromRole = rolePermissions.includes(perm.code);
                  const effective = effectiveSet.has(perm.code);
                  const isOverride =
                    overrides.grants.includes(perm.code) || overrides.denies.includes(perm.code);
                  return (
                    <tr key={perm.code} className={isOverride ? "perm-override-row" : undefined}>
                      <td className="perm-label-cell">
                        <strong>{perm.name}</strong>
                        <span className="perm-desc">{perm.description}</span>
                      </td>
                      <td className="perm-check-cell">
                        <input type="checkbox" checked={fromRole} disabled readOnly aria-label={`Role default: ${perm.name}`} />
                      </td>
                      <td className="perm-check-cell">
                        <input
                          type="checkbox"
                          checked={effective}
                          disabled={!editable || saving}
                          aria-label={`Effective: ${perm.name}`}
                          onChange={(e) => toggle(perm.code, e.target.checked)}
                        />
                        {isOverride && <span className="perm-override-tag">Custom</span>}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { buildOverrides };
