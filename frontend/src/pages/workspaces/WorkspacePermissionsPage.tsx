import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { Permission, WorkspaceMember, WorkspaceRole } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { ErrorState } from "../../shared/StateBox";
import { MemberPermissionEditor, PermissionMatrixTable } from "./PermissionMatrix";

type Tab = "roles" | "members";

export function WorkspacePermissionsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const { activeWorkspace } = useWorkspace();
  const { isOwner, hasPermission } = usePermissions();
  const wsId = workspaceId ?? activeWorkspace?.id;

  const [tab, setTab] = useState<Tab>("roles");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [memberSaving, setMemberSaving] = useState(false);

  const loadMatrix = useCallback(async () => {
    if (!token || !wsId) return;
    setLoading(true);
    setError("");
    try {
      const [matrix, memberList] = await Promise.all([
        api.getPermissionMatrix(token, wsId),
        api.listMembers(token, wsId),
      ]);
      setPermissions(matrix.permissions);
      setRoles(matrix.roles);
      setMembers(memberList.members);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, wsId]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    if (!token || !wsId || !selectedMemberId) {
      setSelectedMember(null);
      return;
    }
    api.getMember(token, wsId, selectedMemberId)
      .then(({ member }) => setSelectedMember(member))
      .catch((e) => setError((e as Error).message));
  }, [token, wsId, selectedMemberId]);

  if (!wsId) return <Navigate to="/workspaces" replace />;
  if (!hasPermission("member.view")) {
    return <ErrorState message="You don't have permission to view workspace permissions." />;
  }
  if (loading) return <TablePageSkeleton cols={5} filters={0} />;
  if (error && roles.length === 0) return <ErrorState message={error} />;

  const handleRoleToggle = async (roleId: string, permissionCode: string, enabled: boolean) => {
    if (!token || !wsId || !isOwner) return;
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.slug === "owner") return;

    const next = new Set(role.permissions ?? []);
    if (enabled) next.add(permissionCode);
    else next.delete(permissionCode);

    setSavingRoleId(roleId);
    try {
      const { role: updated } = await api.updateRolePermissions(token, wsId, roleId, Array.from(next));
      setRoles((prev) => prev.map((r) => (r.id === roleId ? updated : r)));
      toast.patched("Role permissions");
    } catch (e) {
      toast.fromError(e, "Could not update role permissions");
      setError((e as Error).message);
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleResetRole = async (roleId: string) => {
    if (!token || !wsId || !isOwner) return;
    setSavingRoleId(roleId);
    try {
      const { role: updated } = await api.resetRolePermissions(token, wsId, roleId);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? updated : r)));
      toast.success("Role reset", "Permissions were restored to defaults.");
    } catch (e) {
      toast.fromError(e, "Could not reset role");
      setError((e as Error).message);
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleMemberSave = async (overrides: { permission_code: string; effect: "grant" | "deny" }[]) => {
    if (!token || !wsId || !selectedMemberId || !isOwner) return;
    setMemberSaving(true);
    try {
      const { member } = await api.updateMemberPermissions(token, wsId, selectedMemberId, overrides);
      setSelectedMember(member);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...member } : m)));
      toast.saved("Member permissions");
    } catch (e) {
      toast.fromError(e, "Could not save member permissions");
      setError((e as Error).message);
    } finally {
      setMemberSaving(false);
    }
  };

  const handleMemberReset = async () => {
    if (!token || !wsId || !selectedMemberId || !isOwner) return;
    setMemberSaving(true);
    try {
      const { member } = await api.resetMemberPermissions(token, wsId, selectedMemberId);
      setSelectedMember(member);
      toast.success("Overrides cleared", "Member permissions were reset to their role defaults.");
    } catch (e) {
      toast.fromError(e, "Could not reset member permissions");
      setError((e as Error).message);
    } finally {
      setMemberSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Permission matrix is unique to this workspace. Only the workspace owner can customize roles and individual members."
        actions={
          <Link to={`/workspaces/${wsId}`} className="btn btn-secondary">
            Back to workspace
          </Link>
        }
      />

      {!isOwner && (
        <div className="info-banner">
          You can view this matrix but only the workspace owner can make changes.
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="perm-tabs">
        <button type="button" className={`perm-tab${tab === "roles" ? " active" : ""}`} onClick={() => setTab("roles")}>
          Role permissions
        </button>
        <button type="button" className={`perm-tab${tab === "members" ? " active" : ""}`} onClick={() => setTab("members")}>
          Member overrides
        </button>
      </div>

      {tab === "roles" && (
        <div className="card perm-panel">
          <div className="perm-panel-head">
            <div>
              <h3>Role permission matrix</h3>
              <p className="muted">Each workspace has its own roles and permission assignments.</p>
            </div>
            {isOwner && (
              <div className="perm-role-actions">
                {roles.filter((r) => r.is_system && r.slug !== "owner").map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={savingRoleId === role.id}
                    onClick={() => handleResetRole(role.id)}
                  >
                    Reset {role.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <PermissionMatrixTable
            permissions={permissions}
            roles={roles}
            editable={isOwner}
            savingRoleId={savingRoleId}
            onToggle={handleRoleToggle}
          />
        </div>
      )}

      {tab === "members" && (
        <div className="card perm-panel">
          <div className="perm-panel-head">
            <div>
              <h3>Per-member customization</h3>
              <p className="muted">Grant or deny permissions for a specific user on top of their role.</p>
            </div>
          </div>

          <div className="member-perm-layout">
            <div className="member-list-panel">
              <label>
                Select member
                <select
                  className="select"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                >
                  <option value="">Choose a member…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.role_slug === "owner"}>
                      {m.username} ({m.role_name}){m.role_slug === "owner" ? " — owner locked" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <ul className="member-mini-list">
                {members.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={`member-mini-item${selectedMemberId === m.id ? " active" : ""}`}
                      disabled={m.role_slug === "owner"}
                      onClick={() => setSelectedMemberId(m.id)}
                    >
                      <strong>{m.username}</strong>
                      <span>{m.role_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="member-editor-panel">
              {!selectedMember ? (
                <p className="muted">Select a member to customize their permissions.</p>
              ) : selectedMember.role_slug === "owner" ? (
                <p className="muted">The workspace owner always has full permissions.</p>
              ) : (
                <MemberPermissionEditor
                  permissions={permissions}
                  rolePermissions={selectedMember.role_permissions ?? []}
                  effectivePermissions={selectedMember.effective_permissions ?? []}
                  overrides={selectedMember.permission_overrides ?? { grants: [], denies: [] }}
                  editable={isOwner}
                  saving={memberSaving}
                  onSave={handleMemberSave}
                  onReset={handleMemberReset}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
