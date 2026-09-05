import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import { APP_NAME, APP_VERSION } from "../../version";
import type { AppVersion } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { AvatarUpload } from "../../shared/FileAttachments";
import { UserAccessPanel } from "../../shared/UserAccessPanel";

export function SettingsPage() {
  const { user, token } = useAuth();
  const { activeWorkspace, refresh: refreshWorkspaces } = useWorkspace();
  const { isCreator } = usePermissions();
  const toast = useToast();
  const [version, setVersion] = useState<AppVersion | null>(null);
  const [approvalEnabled, setApprovalEnabled] = useState(true);
  const [savingApproval, setSavingApproval] = useState(false);

  useEffect(() => {
    api.getVersion().then(setVersion).catch(() => setVersion({ name: APP_NAME, version: APP_VERSION }));
  }, []);

  useEffect(() => {
    if (activeWorkspace) {
      setApprovalEnabled(activeWorkspace.approval_flows_enabled !== 0);
    }
  }, [activeWorkspace]);

  const handleApprovalToggle = useCallback(async () => {
    if (!token || !activeWorkspace?.id || !isCreator) return;
    const next = !approvalEnabled;
    setSavingApproval(true);
    try {
      const { workspace } = await api.setApprovalFlowsEnabled(token, activeWorkspace.id, next);
      setApprovalEnabled(workspace.approval_flows_enabled !== 0);
      await refreshWorkspaces();
      toast.success("Settings saved", next ? "Approval flows are enabled." : "Approval flows are disabled.");
    } catch (e) {
      toast.fromError(e, "Could not update approval flow settings");
    } finally {
      setSavingApproval(false);
    }
  }, [token, activeWorkspace?.id, isCreator, approvalEnabled, refreshWorkspaces, toast]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account and workspace preferences" />
      <section className="card form-stack">
        <h3 className="card-title">Profile</h3>
        <AvatarUpload />
      </section>
      <section className="card form-stack">
        <h3 className="card-title">Account</h3>
        <dl className="detail-list">
          <div><dt>Username</dt><dd>{user?.username}</dd></div>
          <div><dt>Email</dt><dd>{user?.email}</dd></div>
        </dl>
      </section>
      <section className="card form-stack">
        <h3 className="card-title">Application</h3>
        <dl className="detail-list">
          <div><dt>Name</dt><dd>{version?.name ?? "Jellyfish Workspace"}</dd></div>
          <div><dt>Version</dt><dd>{version?.version ?? "…"}</dd></div>
        </dl>
      </section>
      {activeWorkspace && <UserAccessPanel compact />}
      {activeWorkspace && (
        <section className="card form-stack">
          <h3 className="card-title">Active workspace</h3>
          <p className="muted">Roles, permissions, and assignments below apply to this workspace only.</p>
          <dl className="detail-list">
            <div><dt>Name</dt><dd>{activeWorkspace.name}</dd></div>
            {activeWorkspace.description && (
              <div><dt>Description</dt><dd>{activeWorkspace.description}</dd></div>
            )}
          </dl>
          {isCreator && (
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={approvalEnabled}
                disabled={savingApproval}
                onChange={handleApprovalToggle}
              />
              <span>
                <strong>Approval flows</strong>
                <span className="muted block">
                  When enabled, members without a required permission can request approval from you (workspace creator).
                </span>
              </span>
            </label>
          )}
        </section>
      )}
    </div>
  );
}
