import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useApprovals } from "../../context/ApprovalsContext";
import { useMembers } from "../../context/MembersContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import { api } from "../../services/api";
import { debounce } from "../../utils/debounce";
import type { Permission, WorkspaceMember, WorkspaceRole } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { ErrorState } from "../../shared/StateBox";
import { MemberPermissionEditor } from "./PermissionMatrix";
import { UserAccessPanel, memberOverrideLabel } from "../../shared/UserAccessPanel";
import { MemberMembershipPanel } from "../../shared/MemberMembershipPanel";
import { UserAvatar } from "../../shared/UserAvatar";

type Tab = "users" | "approvals";

function roleOptionsForMember(member: WorkspaceMember, roles: WorkspaceRole[]): WorkspaceRole[] {
  if (roles.some((r) => r.id === member.role_id)) return roles;
  const fallback: WorkspaceRole = {
    id: member.role_id,
    name: member.role_name,
    slug: member.role_slug,
    workspace_id: member.workspace_id,
    is_system: 0,
    created_at: "",
    updated_at: "",
    permissions: member.role_permissions ?? [],
  };
  return [...roles, fallback];
}

export function WorkspacePermissionsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const { activeWorkspace, workspaces } = useWorkspace();
  const {
    permissions: activePermissions,
    isOwner: activeIsOwner,
    canDecideAnyApproval: activeCanDecide,
    hasPermission: hasActivePerm,
  } = usePermissions();
  const { members: sharedMembers, refresh: refreshMembers } = useMembers();
  const sharedMembersRef = useRef(sharedMembers);
  sharedMembersRef.current = sharedMembers;
  const { pendingApprovals, myApprovals, pendingCount, refresh: refreshApprovals } = useApprovals();
  const wsId = workspaceId ?? activeWorkspace?.id;
  const isActiveWorkspace = wsId === activeWorkspace?.id;
  const workspaceName = workspaces.find((w) => w.id === wsId)?.name ?? activeWorkspace?.name;
  const pageWorkspace = workspaces.find((w) => w.id === wsId);

  const [tab, setTab] = useState<Tab>("users");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberSaving, setMemberSaving] = useState(false);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);

  const pageIsOwner = isActiveWorkspace
    ? activeIsOwner
    : (pageWorkspace?.my_membership?.is_owner ?? false);
  const pageHasPermission = (code: string) =>
    isActiveWorkspace
      ? activePermissions.includes(code)
      : (pageWorkspace?.my_membership?.permissions.includes(code) ?? false);
  const canManagePermissions = pageIsOwner;
  const canChangeRoles = pageIsOwner || pageHasPermission("member.change_role");
  const canViewPage = pageHasPermission("member.view") || hasActivePerm("member.view");
  const canDecideApprovals = pageIsOwner || (isActiveWorkspace && activeCanDecide);
  const matrixRoles = roles.filter((r) => r.slug !== "owner");
  const editableMembers = members.filter((m) => m.role_slug !== "owner");
  const selectedMember = useMemo(
    () => editableMembers.find((m) => m.id === selectedMemberId) ?? null,
    [editableMembers, selectedMemberId]
  );

  const resolveRoleName = useCallback(
    (roleId: string, fallback = "—") => roles.find((r) => r.id === roleId)?.name ?? fallback,
    [roles]
  );

  const upsertMember = useCallback((member: WorkspaceMember) => {
    setMembers((prev) => prev.map((m) => (m.id === member.id ? member : m)));
  }, []);

  const loadMatrix = useCallback(async () => {
    if (!token || !wsId) return;
    setLoading(true);
    setError("");
    try {
      const matrixPromise = api.getPermissionMatrix(token, wsId);
      const membersPromise = isActiveWorkspace && sharedMembersRef.current.length > 0
        ? Promise.resolve({ members: sharedMembersRef.current })
        : api.listMembers(token, wsId);

      const [matrix, memberList] = await Promise.all([matrixPromise, membersPromise]);
      setPermissions(matrix.permissions);
      setRoles(matrix.roles);
      setMembers(memberList.members);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, wsId, isActiveWorkspace]);

  const debouncedLoadMatrix = useMemo(() => debounce(() => void loadMatrix(), 300), [loadMatrix]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    return () => debouncedLoadMatrix.cancel();
  }, [debouncedLoadMatrix]);

  useSocketEvent<{ workspaceId: string }>(
    "permissions:updated",
    (payload) => {
      if (payload.workspaceId === wsId) {
        debouncedLoadMatrix();
        if (isActiveWorkspace) void refreshMembers();
      }
    },
    !!token && !!wsId
  );

  useSocketEvent<{ workspaceId: string }>(
    "approvals:changed",
    (payload) => {
      if (payload.workspaceId === wsId) {
        void refreshApprovals();
      }
    },
    !!token && !!wsId
  );

  useEffect(() => {
    if (!loading && tab === "users" && editableMembers.length > 0 && !selectedMemberId) {
      setSelectedMemberId(editableMembers[0].id);
    }
  }, [loading, tab, editableMembers, selectedMemberId]);

  useEffect(() => {
    if (selectedMemberId && !editableMembers.some((m) => m.id === selectedMemberId)) {
      setSelectedMemberId(editableMembers[0]?.id ?? "");
    }
  }, [editableMembers, selectedMemberId]);

  useEffect(() => {
    if (!token || !wsId || !selectedMemberId) return;
    api.getMember(token, wsId, selectedMemberId)
      .then(({ member }) => upsertMember(member))
      .catch((e) => setError((e as Error).message));
  }, [token, wsId, selectedMemberId, upsertMember]);

  const handleMemberSave = async (overrides: { permission_code: string; effect: "grant" | "deny" }[]) => {
    if (!token || !wsId || !selectedMemberId || !canManagePermissions) return;
    setMemberSaving(true);
    try {
      const { member } = await api.updateMemberPermissions(token, wsId, selectedMemberId, overrides);
      upsertMember(member);
      toast.saved("Member permissions");
    } catch (e) {
      toast.fromError(e, "Could not save member permissions");
      setError((e as Error).message);
    } finally {
      setMemberSaving(false);
    }
  };

  const handleMemberRoleChange = async (memberId: string, roleId: string) => {
    if (!token || !wsId || !canChangeRoles) return;
    const nextRole = matrixRoles.find((r) => r.id === roleId);
    const previousMember = members.find((m) => m.id === memberId);

    if (nextRole && previousMember) {
      upsertMember({
        ...previousMember,
        role_id: roleId,
        role_name: nextRole.name,
        role_slug: nextRole.slug,
        role_permissions: nextRole.permissions ?? [],
      });
    }

    setRoleChangingId(memberId);
    try {
      const { member } = await api.changeMemberRole(token, wsId, memberId, roleId);
      upsertMember(member);
      toast.success("Role updated", `${member.username} is now ${resolveRoleName(member.role_id, member.role_name)}.`);
    } catch (e) {
      if (previousMember) upsertMember(previousMember);
      toast.fromError(e, "Could not change member role");
    } finally {
      setRoleChangingId(null);
    }
  };

  const handleMemberReset = async () => {
    if (!token || !wsId || !selectedMemberId || !canManagePermissions) return;
    setMemberSaving(true);
    try {
      const { member } = await api.resetMemberPermissions(token, wsId, selectedMemberId);
      upsertMember(member);
      toast.success("Overrides cleared", "Member permissions were reset to their role defaults.");
    } catch (e) {
      toast.fromError(e, "Could not reset member permissions");
      setError((e as Error).message);
    } finally {
      setMemberSaving(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!token || !wsId) return;
    setApprovalActionId(requestId);
    try {
      await api.approveRequest(token, wsId, requestId);
      await refreshApprovals();
    } catch (e) {
      toast.fromError(e, "Could not approve request");
    } finally {
      setApprovalActionId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!token || !wsId) return;
    const note = window.prompt("Optional note for rejection:") ?? "";
    setApprovalActionId(requestId);
    try {
      await api.rejectApprovalRequest(token, wsId, requestId, note);
      await refreshApprovals();
    } catch (e) {
      toast.fromError(e, "Could not reject request");
    } finally {
      setApprovalActionId(null);
    }
  };

  if (!wsId) return <Navigate to="/workspaces" replace />;
  if (!loading && !canViewPage) {
    return <ErrorState message="You don't have permission to view workspace permissions." />;
  }
  if (loading) return <TablePageSkeleton cols={5} filters={0} />;
  if (error && roles.length === 0) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title={workspaceName ? `Roles & Permissions — ${workspaceName}` : "Roles & Permissions"}
        subtitle="Manage member roles and permissions for this workspace. The workspace owner is not listed — update each member directly from the user list."
        actions={
          <Link to={`/workspaces/${wsId}`} className="btn btn-secondary">
            Back to workspace
          </Link>
        }
      />

      {!canManagePermissions && (
        <div className="info-banner">
          {canChangeRoles
            ? "You can change member roles. Only the workspace owner can edit member permissions."
            : "You can view this page but only the workspace owner can make changes."}
        </div>
      )}

      {canManagePermissions && (
        <div className="info-banner info-banner-success">
          You are the workspace owner. Select a member below to change their role or permissions.
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <UserAccessPanel workspaceName={workspaceName} />

      <div className="perm-tabs">
        <button type="button" className={`perm-tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
          Users
        </button>
        <button type="button" className={`perm-tab${tab === "approvals" ? " active" : ""}`} onClick={() => setTab("approvals")}>
          Approval flows{canDecideApprovals && pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
      </div>

      {tab === "users" && (
        <div className="card perm-panel">
          <div className="perm-panel-head">
            <div>
              <h3>Workspace users</h3>
              <p className="muted">
                All members except the workspace owner. Select a user to change their role or edit permissions directly.
              </p>
            </div>
          </div>

          <div className="user-perm-layout">
            <div className="user-list-section">
              <table className="data-table user-perm-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th className="role-col">Role</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {editableMembers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">No editable members. The workspace owner is excluded from this list.</td>
                    </tr>
                  ) : (
                    editableMembers.map((m) => (
                      <tr
                        key={m.id}
                        className={selectedMemberId === m.id ? "selected" : undefined}
                        onClick={() => setSelectedMemberId(m.id)}
                      >
                        <td>
                          <div className="user-perm-cell">
                            <UserAvatar user={{ id: m.user_id, username: m.username, avatar_url: m.avatar_url }} size="sm" />
                            <strong>{m.username}</strong>
                          </div>
                        </td>
                        <td className="muted">{m.email}</td>
                        <td className="role-col" onClick={(e) => e.stopPropagation()}>
                          {canChangeRoles ? (
                            <select
                              className="select select-sm role-select"
                              value={m.role_id}
                              disabled={roleChangingId === m.id}
                              aria-label={`Role for ${m.username}`}
                              onChange={(e) => handleMemberRoleChange(m.id, e.target.value)}
                            >
                              {roleOptionsForMember(m, matrixRoles).map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="badge">{resolveRoleName(m.role_id, m.role_name)}</span>
                          )}
                        </td>
                        <td className="muted">{memberOverrideLabel(m, resolveRoleName(m.role_id, m.role_name))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="user-detail-section">
              {!selectedMember ? (
                <p className="muted">Select a user from the list to change their role or permissions.</p>
              ) : (
                <>
                  <UserAccessPanel member={selectedMember} compact workspaceName={workspaceName} />

                  {wsId && <MemberMembershipPanel memberId={selectedMember.id} workspaceId={wsId} />}

                  {canChangeRoles && (
                    <label className="user-role-field">
                      Role
                      <select
                        className="select"
                        value={selectedMember.role_id}
                        disabled={roleChangingId === selectedMember.id}
                        onChange={(e) => handleMemberRoleChange(selectedMember.id, e.target.value)}
                      >
                        {roleOptionsForMember(selectedMember, matrixRoles).map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <section className="user-detail-block">
                    <div className="user-detail-block-head">
                      <div>
                        <h4>Permissions — {selectedMember.username}</h4>
                        <p className="muted">
                          Toggle permissions for this member. Changes apply only to {selectedMember.username}, not other users with the same role.
                        </p>
                      </div>
                    </div>
                    <MemberPermissionEditor
                      permissions={permissions}
                      rolePermissions={selectedMember.role_permissions ?? []}
                      effectivePermissions={selectedMember.effective_permissions ?? []}
                      overrides={selectedMember.permission_overrides ?? { grants: [], denies: [] }}
                      editable={canManagePermissions}
                      saving={memberSaving}
                      onSave={handleMemberSave}
                      onReset={handleMemberReset}
                    />
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <div className="card perm-panel">
          <div className="perm-panel-head">
            <div>
              <h3>Approval flows</h3>
              <p className="muted">
                Members without a permission can request access. Workspace owners and authorized admins approve or reject requests.
              </p>
            </div>
          </div>

          {canDecideApprovals && (
            <section className="approval-section">
              <h4>Pending requests</h4>
              {pendingApprovals.length === 0 ? (
                <p className="muted">No pending approval requests.</p>
              ) : (
                <ul className="approval-list">
                  {pendingApprovals.map((req) => (
                    <li key={req.id} className="approval-item">
                      <div>
                        <strong>{req.requester_username}</strong>
                        <span className="muted"> requested </span>
                        <strong>{req.permission_name}</strong>
                        <p className="muted">{req.title}</p>
                      {req.attempt_number && req.attempt_number > 1 && (
                        <p className="muted small">Attempt #{req.attempt_number}</p>
                      )}
                      </div>
                      <div className="approval-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={approvalActionId === req.id}
                          onClick={() => handleApprove(req.id)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          disabled={approvalActionId === req.id}
                          onClick={() => handleReject(req.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="approval-section">
            <h4>My requests</h4>
            {myApprovals.length === 0 ? (
              <p className="muted">You have not submitted any approval requests.</p>
            ) : (
              <ul className="approval-list">
                {myApprovals.map((req) => (
                  <li key={req.id} className="approval-item">
                    <div>
                      <strong>{req.permission_name}</strong>
                      <span className={`status-pill status-${req.status}`}>{req.status}</span>
                      <p className="muted">{req.title}</p>
                      {req.resolution_note && <p className="muted">Note: {req.resolution_note}</p>}
                    </div>
                    <span className="muted">{new Date(req.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default WorkspacePermissionsPage;
