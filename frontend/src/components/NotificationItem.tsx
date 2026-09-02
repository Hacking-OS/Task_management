import type { Notification } from "../types";
import { notificationIcon, formatTimestamp } from "../utils/notifications";

interface Props {
  notification: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onNavigate: (notification: Notification) => void;
}

export function NotificationItem({ notification, onRead, onDismiss, onNavigate }: Props) {
  const unread = !notification.is_read;

  return (
    <li className={`notification-item ${unread ? "unread" : "read"}`}>
      <button
        type="button"
        className="notification-main"
        onClick={() => {
          if (unread) onRead(notification.id);
          onNavigate(notification);
        }}
      >
        <span className="notif-icon">{notificationIcon(notification.type)}</span>
        <div className="notif-content">
          <div className="notif-header">
            <strong>{notification.title}</strong>
            <span className="notif-type">{notification.type}</span>
          </div>
          <p>{notification.message}</p>
          <time>{formatTimestamp(notification.created_at)}</time>
        </div>
      </button>
      <button
        type="button"
        className="icon-btn dismiss"
        title="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
      >
        ×
      </button>
    </li>
  );
}
