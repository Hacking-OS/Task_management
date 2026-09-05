import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { InvitationPreview, WorkspaceInvitation } from "../../models/types";
import { FormField, inputClass } from "../../shared/FormField";
import {
  firstFormError,
  hasFormErrors,
  validateWorkspaceForm,
  type FormErrors,
} from "../../utils/validation";

export function WorkspaceOnboardingPage() {
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { workspaces, loading: wsLoading, refresh, setActive } = useWorkspace();

  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"name" | "description">>({});
  const [submitError, setSubmitError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedInviteId, setSelectedInviteId] = useState<string>("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [codePreview, setCodePreview] = useState<InvitationPreview | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState("");

  const hasNoWorkspace = workspaces.length === 0;
  const hasOwnerInvite = invitations.length > 0;
  const showInviteOptions = hasNoWorkspace || hasOwnerInvite;

  const loadInvitations = useCallback(async () => {
    if (!token) return;
    setInvitesLoading(true);
    try {
      const { invitations: list } = await api.getMyInvitations(token);
      setInvitations(list);
      if (list.length > 0) setSelectedInviteId(list[0].id);
    } catch {
      setInvitations([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  useEffect(() => {
    if (wsLoading || invitesLoading) return;
    if (!hasNoWorkspace && !hasOwnerInvite) {
      navigate("/dashboard", { replace: true });
    }
  }, [wsLoading, invitesLoading, hasNoWorkspace, hasOwnerInvite, navigate]);

  const finishWithWorkspace = async (workspaceId: string) => {
    await setActive(workspaceId);
    sessionStorage.removeItem("pendingInviteToken");
    navigate("/dashboard", { replace: true });
  };

  const acceptInvite = async (ref: string) => {
    if (!token) return;
    setActionId(ref);
    try {
      const { workspaceId } = await api.acceptInvitation(token, ref);
      await refresh();
      toast.success("Joined workspace", "You are now a member.");
      await finishWithWorkspace(workspaceId);
    } catch (e) {
      toast.fromError(e, "Could not accept invitation");
    } finally {
      setActionId(null);
    }
  };

  const acceptSelectedInvite = () => {
    const inv = invitations.find((i) => i.id === selectedInviteId);
    if (!inv) return;
    void acceptInvite(inv.invite_code ?? inv.token);
  };

  const previewCode = async () => {
    if (!hasNoWorkspace) {
      setCodeError("Invite codes are for users without a workspace. Accept owner invitations from your pending list instead.");
      return;
    }
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) return;
    setCodeLoading(true);
    setCodeError("");
    setCodePreview(null);
    try {
      const { preview } = await api.previewInvitation(code);
      setCodePreview(preview);
      if (!preview.valid) setCodeError("This invite code is invalid or expired.");
    } catch (e) {
      setCodeError((e as Error).message);
    } finally {
      setCodeLoading(false);
    }
  };

  const acceptCodePreview = () => {
    if (!codePreview?.valid || !hasNoWorkspace) return;
    void acceptInvite(codePreview.invite_code);
  };

  const rejectInvite = async (ref: string) => {
    if (!token) return;
    setActionId(ref);
    try {
      await api.rejectInvitation(token, ref);
      await loadInvitations();
      toast.success("Invitation declined");
    } catch (e) {
      toast.fromError(e, "Could not decline invitation");
    } finally {
      setActionId(null);
    }
  };

  useEffect(() => {
    const pending = sessionStorage.getItem("pendingInviteToken");
    if (!pending || !token || invitesLoading) return;
    const match = invitations.find((i) => i.token === pending || i.invite_code === pending.toUpperCase());
    if (match) {
      void acceptInvite(match.invite_code ?? match.token);
    } else if (hasNoWorkspace) {
      setInviteCodeInput(pending.length <= 12 ? pending.toUpperCase() : "");
    }
    sessionStorage.removeItem("pendingInviteToken");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when invites load
  }, [invitesLoading, invitations, token, hasNoWorkspace]);

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !hasNoWorkspace) return;

    const errors = validateWorkspaceForm({ name, description });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setCreating(true);
    setSubmitError("");
    try {
      const { workspace } = await api.createWorkspace(token, {
        name: name.trim(),
        description: description.trim(),
      });
      await refresh();
      toast.created("Workspace");
      await finishWithWorkspace(workspace.id);
    } catch (err) {
      toast.fromError(err, "Could not create workspace");
      setSubmitError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (wsLoading || invitesLoading) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-shell">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!showInviteOptions) {
    return null;
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <p className="eyebrow">Get started</p>
          <h1>{hasNoWorkspace ? "Welcome to Jellyfish" : "Workspace invitation"}</h1>
          <p className="muted">
            {hasNoWorkspace
              ? "You don't belong to a workspace yet. Create your own, or use an invite code / invitation sent by a workspace owner."
              : "A workspace owner invited you to join their team. Accept below to add another workspace to your account."}
          </p>
        </header>

        <div className={`onboarding-grid${hasNoWorkspace ? " onboarding-grid-3" : ""}`}>
          {hasNoWorkspace && (
            <section className="card onboarding-card">
              <h2>Create a workspace</h2>
              <p className="muted">Start your own workspace. You will be the owner and can invite others later.</p>
              <form className="form-grid onboarding-form" onSubmit={createWorkspace} noValidate>
                <FormField label="Workspace name" required error={fieldErrors.name}>
                  <input
                    className={inputClass("input", fieldErrors.name)}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFieldErrors((prev) => {
                        if (!prev.name) return prev;
                        const next = { ...prev };
                        delete next.name;
                        return next;
                      });
                    }}
                    maxLength={80}
                    placeholder="Acme Software"
                  />
                </FormField>
                <FormField label="Description" className="span-2" error={fieldErrors.description}>
                  <input
                    className={inputClass("input", fieldErrors.description)}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setFieldErrors((prev) => {
                        if (!prev.description) return prev;
                        const next = { ...prev };
                        delete next.description;
                        return next;
                      });
                    }}
                    maxLength={10000}
                    placeholder="Optional description"
                  />
                </FormField>
                {submitError && <p className="form-error form-summary-error span-2">{submitError}</p>}
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? "Creating…" : "Create workspace"}
                </button>
              </form>
            </section>
          )}

          {hasNoWorkspace && (
            <section className="card onboarding-card">
              <h2>Join with invite code</h2>
              <p className="muted">Enter the code a workspace owner shared with you (for new users without a workspace).</p>
              <div className="invite-code-entry">
                <input
                  className="input invite-code-input"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="AB12CD34"
                  maxLength={8}
                />
                <button type="button" className="btn btn-secondary" disabled={codeLoading || !inviteCodeInput.trim()} onClick={previewCode}>
                  {codeLoading ? "Checking…" : "Check code"}
                </button>
              </div>
              {codeError && <p className="form-error">{codeError}</p>}
              {codePreview?.valid && (
                <div className="invite-preview-box">
                  <p><strong>{codePreview.workspace_name}</strong> · {codePreview.role_name}</p>
                  <p className="muted">For {codePreview.email}</p>
                  <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(actionId)} onClick={acceptCodePreview}>
                    Accept & join
                  </button>
                </div>
              )}
            </section>
          )}

          {hasOwnerInvite && (
            <section className="card onboarding-card">
              <h2>{hasNoWorkspace ? "Pending invitations" : "Owner invitation"}</h2>
              <p className="muted">
                {hasNoWorkspace
                  ? "Select an invitation a workspace owner sent to your email."
                  : "These invitations were sent to your email by a workspace owner."}
              </p>
              <ul className="onboarding-invite-list onboarding-invite-select-list">
                {invitations.map((inv) => (
                  <li key={inv.id}>
                    <label className={`onboarding-invite-item onboarding-invite-select${selectedInviteId === inv.id ? " selected" : ""}`}>
                      <input
                        type="radio"
                        name="pending-invite"
                        checked={selectedInviteId === inv.id}
                        onChange={() => setSelectedInviteId(inv.id)}
                      />
                      <div>
                        <strong>{inv.workspace_name ?? "Workspace"}</strong>
                        {inv.invite_code && <code className="invite-code-inline">{inv.invite_code}</code>}
                        <p className="muted">
                          Role: {inv.role_name} · Invited by {inv.invited_by_username}
                        </p>
                        <p className="muted invite-expiry">Expires {new Date(inv.expires_at).toLocaleString()}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="onboarding-invite-actions-bar">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedInviteId || Boolean(actionId)}
                  onClick={acceptSelectedInvite}
                >
                  Accept selected workspace
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!selectedInviteId || Boolean(actionId)}
                  onClick={() => {
                    const inv = invitations.find((i) => i.id === selectedInviteId);
                    if (inv) void rejectInvite(inv.invite_code ?? inv.token);
                  }}
                >
                  Decline
                </button>
              </div>
            </section>
          )}
        </div>

        {!hasNoWorkspace && hasOwnerInvite && (
          <p className="onboarding-skip muted">
            Not joining another workspace?{" "}
            <button type="button" className="link-btn" onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default WorkspaceOnboardingPage;
