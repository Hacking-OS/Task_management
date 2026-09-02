import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { EmptyState } from "../../shared/StateBox";
import { NotificationItem } from "../../shared/NotificationItem";

export function NotificationsPage() {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const {
    notifications,
    loading,
    markRead,
    markAllRead,
    dismiss,
    acceptInvite,
    rejectInvite,
  } = useNotifications();

  if (!token || loading) return <TablePageSkeleton cols={3} filters={0} />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={activeWorkspace ? `Updates for ${activeWorkspace.name}` : "All workspace updates"}
        actions={<button type="button" className="btn btn-secondary" onClick={markAllRead}>Mark all read</button>}
      />
      {notifications.length === 0 ? (
        <EmptyState message="No notifications yet." />
      ) : (
        <div className="notif-page-list">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={markRead}
              onDismiss={dismiss}
              onAcceptInvite={acceptInvite}
              onRejectInvite={rejectInvite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
