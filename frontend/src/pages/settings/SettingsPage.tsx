import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PageHeader } from "../../shared/PageHeader";
import { AvatarUpload } from "../../shared/FileAttachments";

export function SettingsPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

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
      {activeWorkspace && (
        <section className="card form-stack">
          <h3 className="card-title">Active workspace</h3>
          <dl className="detail-list">
            <div><dt>Name</dt><dd>{activeWorkspace.name}</dd></div>
            {activeWorkspace.description && (
              <div><dt>Description</dt><dd>{activeWorkspace.description}</dd></div>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
