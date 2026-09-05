import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import type { InvitationPreview } from "../../models/types";

export function InviteLandingPage() {
  const { token: inviteToken, code: inviteCode } = useParams<{ token?: string; code?: string }>();
  const inviteRef = (inviteCode ?? inviteToken ?? "").trim();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!inviteRef) {
      setError("Invalid invitation link.");
      setLoading(false);
      return;
    }
    api.previewInvitation(inviteRef)
      .then(({ preview: p }) => setPreview(p))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [inviteRef]);

  useEffect(() => {
    if (!user || !token || !inviteRef || !preview?.valid || redirecting) return;

    let cancelled = false;
    setRedirecting(true);

    void (async () => {
      if (user.email.toLowerCase() !== preview.email.toLowerCase()) {
        if (!cancelled) {
          setError(`This invitation was sent to ${preview.email}. Sign in with that email to accept.`);
          setRedirecting(false);
        }
        return;
      }

      try {
        const [{ workspaces }, { invitations }] = await Promise.all([
          api.getWorkspaces(token),
          api.getMyInvitations(token),
        ]);
        if (cancelled) return;

        const refUpper = inviteRef.toUpperCase();
        const isOwnerInvite = invitations.some(
          (i) => i.token === inviteRef || i.invite_code === refUpper
        );

        if (workspaces.length > 0 && !isOwnerInvite) {
          setError(
            "Invites apply when you have no workspace, or when a workspace owner sent an invitation to your email."
          );
          setRedirecting(false);
          return;
        }

        sessionStorage.setItem("pendingInviteToken", inviteRef);
        navigate("/onboarding", { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setRedirecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, token, inviteRef, preview, navigate, redirecting]);

  if (loading || redirecting) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="muted">{redirecting ? "Checking invitation…" : "Loading invitation…"}</p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Invitation unavailable</h1>
          <p className="muted">{error || "This invitation could not be loaded."}</p>
          <Link to="/login" className="btn btn-primary btn-block">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (!preview.valid) {
    const message =
      preview.reason === "expired"
        ? "This invitation has expired. Ask the workspace owner to send a new one."
        : preview.reason === "not_found"
          ? "This invitation code or link is invalid."
          : "This invitation is no longer available.";
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Invitation unavailable</h1>
          <p className="muted">{message}</p>
          <Link to="/login" className="btn btn-primary btn-block">Go to sign in</Link>
        </div>
      </div>
    );
  }

  const code = preview.invite_code;
  const loginUrl = `/login?invite=${encodeURIComponent(inviteRef)}&mode=register&email=${encodeURIComponent(preview.email)}`;
  const signInUrl = `/login?invite=${encodeURIComponent(inviteRef)}&email=${encodeURIComponent(preview.email)}`;

  return (
    <div className="login-page">
      <div className="login-card onboarding-invite-card">
        <p className="eyebrow">Workspace invitation</p>
        <h1>Join {preview.workspace_name}</h1>
        <p className="muted">
          <strong>{preview.invited_by_username}</strong> invited you to join as <strong>{preview.role_name}</strong>.
        </p>

        <div className="invite-preview-box">
          {code && (
            <p>
              <span className="muted">Invite code</span><br />
              <code className="invite-code-display">{code}</code>
            </p>
          )}
          <p><span className="muted">Invited email</span><br /><strong>{preview.email}</strong></p>
          <p className="muted invite-expiry">Expires {new Date(preview.expires_at).toLocaleString()}</p>
        </div>

        <p className="muted">
          Create an account with <strong>{preview.email}</strong> or sign in if you already have one.
          If you already belong to a workspace, the owner must invite your account email directly.
        </p>

        <div className="onboarding-actions">
          <Link to={loginUrl} className="btn btn-primary btn-block">Create account & join</Link>
          <Link to={signInUrl} className="btn btn-secondary btn-block">Sign in to accept</Link>
        </div>
      </div>
    </div>
  );
}

export default InviteLandingPage;
