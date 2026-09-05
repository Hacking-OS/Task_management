import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { WorkspaceInvitation, WorkspaceRole } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { FormField, inputClass } from "../../shared/FormField";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { EmptyState } from "../../shared/StateBox";
import { firstFormError, hasFormErrors, validateEmail, validateWorkspaceForm, type FormErrors } from "../../utils/validation";
import { hasPermissionInWorkspace, workspaceRoleLabel } from "../../utils/workspacePermissions";

function copyText(value: string, toast: ReturnType<typeof useToast>) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success("Copied", "Invite code copied to clipboard."),
    () => toast.warning("Copy failed", value)
  );
}

export function WorkspacesPage() {
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { workspaces, activeWorkspace, loading, refresh, setActive } = useWorkspace();
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvitation[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"name" | "description">>({});
  const [submitError, setSubmitError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteRoles, setInviteRoles] = useState<WorkspaceRole[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [lastInviteCode, setLastInviteCode] = useState("");
  const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvitation[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const ownerWorkspaces = useMemo(
    () => workspaces.filter((w) => w.my_membership?.is_owner),
    [workspaces]
  );

  useEffect(() => {
    if (!token) return;
    api.getMyInvitations(token)
      .then(({ invitations }) => setPendingInvites(invitations))
      .catch(() => setPendingInvites([]));
  }, [token]);

  const openWorkspace = async (id: string) => {
    await setActive(id);
    navigate("/dashboard", { replace: true });
  };

  useEffect(() => {
    if (!inviteWorkspaceId && ownerWorkspaces.length > 0) {
      const preferred = ownerWorkspaces.find((w) => w.id === activeWorkspace?.id) ?? ownerWorkspaces[0];
      setInviteWorkspaceId(preferred.id);
    }
  }, [ownerWorkspaces, inviteWorkspaceId, activeWorkspace?.id]);

  useEffect(() => {
    if (!token || !inviteWorkspaceId) return;
    api.getPermissionMatrix(token, inviteWorkspaceId)
      .then(({ roles }) => {
        const assignable = roles.filter((r) => r.slug !== "owner");
        setInviteRoles(assignable);
        setInviteRoleId((prev) => (assignable.some((r) => r.id === prev) ? prev : assignable[0]?.id ?? ""));
      })
      .catch(() => setInviteRoles([]));
  }, [token, inviteWorkspaceId]);

  const loadWorkspaceInvites = useCallback(async () => {
    if (!token || !inviteWorkspaceId) return;
    setInvitesLoading(true);
    try {
      const { invitations } = await api.listWorkspaceInvitations(token, inviteWorkspaceId);
      setWorkspaceInvites(invitations.filter((i) => i.status === "pending"));
    } catch {
      setWorkspaceInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [token, inviteWorkspaceId]);

  useEffect(() => {
    loadWorkspaceInvites();
  }, [loadWorkspaceInvites]);

  const clearError = (key: keyof typeof fieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const errors = validateWorkspaceForm({ name, description });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setCreating(true);
    setSubmitError("");
    const trimmedName = name.trim();
    try {
      const { workspace: created } = await api.createWorkspace(token, {
        name: trimmedName,
        description: description.trim(),
      });
      setName("");
      setDescription("");
      setFieldErrors({});
      await refresh();
      toast.created("Workspace");
      if (created?.id) {
        await setActive(created.id);
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      toast.fromError(err, "Could not create workspace");
      setSubmitError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteWorkspaceId || !inviteRoleId) return;
    const emailErr = validateEmail(inviteEmail);
    if (emailErr) {
      setInviteError(emailErr);
      return;
    }
    setInviting(true);
    setInviteError("");
    try {
      const { invitation } = await api.createInvitation(token, inviteWorkspaceId, inviteEmail.trim(), inviteRoleId);
      setInviteEmail("");
      setLastInviteCode(invitation.invite_code ?? "");
      await loadWorkspaceInvites();
      toast.success("Invitation created", `Share code ${invitation.invite_code} with ${invitation.email}.`);
    } catch (err) {
      toast.fromError(err, "Could not send invitation");
      setInviteError((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const revokeInvite = async (invitationId: string) => {
    if (!token || !inviteWorkspaceId) return;
    setRevokingId(invitationId);
    try {
      await api.revokeInvitation(token, inviteWorkspaceId, invitationId);
      await loadWorkspaceInvites();
      toast.success("Invitation revoked");
    } catch (err) {
      toast.fromError(err, "Could not revoke invitation");
    } finally {
      setRevokingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!token || !confirm("Delete this workspace?")) return;
    try {
      await api.deleteWorkspace(token, id);
      await refresh();
      toast.deleted("Workspace");
    } catch (err) {
      toast.fromError(err, "Could not delete workspace");
    }
  };

  const selectedInviteWorkspace = ownerWorkspaces.find((w) => w.id === inviteWorkspaceId);

  if (loading) return <TablePageSkeleton cols={3} filters={0} />;

  return (
    <div>
      <PageHeader
        title="Workspaces"
        subtitle="Create a workspace or, as owner, invite members by email. Invites work for new users or when sent to an existing member's email."
      />

      <section className="card">
        <h3 className="card-title">Create workspace</h3>
        <form className="form-grid" onSubmit={create} noValidate>
          <FormField label="Name" required error={fieldErrors.name}>
            <input
              className={inputClass("input", fieldErrors.name)}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              maxLength={80}
            />
          </FormField>
          <FormField label="Description" className="span-2" error={fieldErrors.description}>
            <input
              className={inputClass("input", fieldErrors.description)}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError("description");
              }}
              maxLength={10000}
            />
          </FormField>
          {submitError && <p className="form-error form-summary-error span-2">{submitError}</p>}
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </section>

      {ownerWorkspaces.length > 0 && (
        <section className="card">
          <h3 className="card-title">Invite member</h3>
          <p className="muted">
            As workspace owner, invite someone by email. They can join when they have no workspace, or when you send an invite to their account email.
          </p>
          <form className="form-grid" onSubmit={sendInvite} noValidate>
            <FormField label="Your workspace">
              <select
                className="select"
                value={inviteWorkspaceId}
                onChange={(e) => setInviteWorkspaceId(e.target.value)}
              >
                {ownerWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Email" required error={inviteError || undefined}>
              <input
                className={inputClass("input", inviteError)}
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError("");
                }}
                placeholder="colleague@company.com"
              />
            </FormField>
            <FormField label="Role">
              <select className="select" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
                {inviteRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </FormField>
            <button type="submit" className="btn btn-secondary" disabled={inviting || !inviteRoleId}>
              {inviting ? "Creating…" : "Create invitation"}
            </button>
          </form>

          {lastInviteCode && (
            <div className="invite-code-result">
              <span className="muted">Latest invite code for {selectedInviteWorkspace?.name}:</span>
              <div className="invite-code-row">
                <code className="invite-code-display">{lastInviteCode}</code>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => copyText(lastInviteCode, toast)}>
                  Copy code
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => copyText(`${window.location.origin}/join/${lastInviteCode}`, toast)}
                >
                  Copy link
                </button>
              </div>
            </div>
          )}

          <div className="invite-manage-section">
            <h4>Pending invitations — {selectedInviteWorkspace?.name ?? "workspace"}</h4>
            {invitesLoading ? (
              <p className="muted">Loading invitations…</p>
            ) : workspaceInvites.length === 0 ? (
              <p className="muted">No pending invitations for this workspace.</p>
            ) : (
              <div className="card-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaceInvites.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <code>{inv.invite_code ?? "—"}</code>
                        </td>
                        <td>{inv.email}</td>
                        <td>{inv.role_name ?? "—"}</td>
                        <td className="muted">{new Date(inv.expires_at).toLocaleDateString()}</td>
                        <td className="actions-cell">
                          {inv.invite_code && (
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => copyText(inv.invite_code!, toast)}>
                              Copy
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            disabled={revokingId === inv.id}
                            onClick={() => revokeInvite(inv.id)}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {pendingInvites.length > 0 && workspaces.length === 0 && (
        <section className="card">
          <h3 className="card-title">Pending invitations</h3>
          <p className="muted">Accept an invitation to join a workspace, or create your own below.</p>
          <ul className="onboarding-invite-list">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="onboarding-invite-item">
                <div>
                  <strong>{inv.workspace_name ?? "Workspace"}</strong>
                  <p className="muted">Role: {inv.role_name} · Invited by {inv.invited_by_username}</p>
                </div>
                <div className="onboarding-invite-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={async () => {
                      if (!token) return;
                      try {
                        const { workspaceId } = await api.acceptInvitation(token, inv.invite_code ?? inv.token);
                        await refresh();
                        await setActive(workspaceId);
                        setPendingInvites((prev) => prev.filter((i) => i.id !== inv.id));
                        toast.success("Joined workspace");
                        navigate("/dashboard", { replace: true });
                      } catch (err) {
                        toast.fromError(err, "Could not accept invitation");
                      }
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={async () => {
                      if (!token) return;
                      try {
                        await api.rejectInvitation(token, inv.invite_code ?? inv.token);
                        setPendingInvites((prev) => prev.filter((i) => i.id !== inv.id));
                        toast.success("Invitation declined");
                      } catch (err) {
                        toast.fromError(err, "Could not decline invitation");
                      }
                    }}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {workspaces.length === 0 ? (
        <EmptyState message="You don't have a workspace yet. Create one or accept a pending invitation above." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Your role</th>
                <th>Members</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link to={`/workspaces/${w.id}`} className="link-primary">{w.name}</Link>
                    <p className="muted workspace-created-at">Created {new Date(w.created_at).toLocaleDateString()}</p>
                  </td>
                  <td className="muted">{w.owner_username ?? "—"}</td>
                  <td>
                    <span className="badge">{workspaceRoleLabel(w)}</span>
                    {w.my_membership?.is_owner && <span className="badge badge-success" style={{ marginLeft: 6 }}>Owner</span>}
                  </td>
                  <td className="muted">{w.member_count ?? "—"}</td>
                  <td className="muted">{w.description || "—"}</td>
                  <td>
                    {activeWorkspace?.id === w.id ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge">Available</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => void openWorkspace(w.id)}>
                      Open workspace
                    </button>
                    <Link to={`/workspaces/${w.id}`} className="btn btn-sm btn-ghost">Details</Link>
                    {hasPermissionInWorkspace(w, "workspace.delete") && (
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(w.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
