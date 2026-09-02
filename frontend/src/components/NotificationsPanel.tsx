import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import type { Notification } from "../types";
import { NotificationItem } from "./NotificationItem";
import { navigationFromNotification } from "../utils/navigation";
import type { NavigationTarget } from "../types";

interface Props {
  onNavigate?: (target: NavigationTarget) => void;
}

export function NotificationsPanel({ onNavigate }: Props) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    api.getNotifications(token).then(({ notifications, unreadCount }) => {
      setNotifications(notifications);
      setUnread(unreadCount);
    }).finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const markRead = async (id: string) => {
    if (!token) return;
    const { unreadCount } = await api.markNotificationRead(token, id);
    setUnread(unreadCount);
    load();
  };

  const markAll = async () => {
    if (!token) return;
    await api.markAllNotificationsRead(token);
    setUnread(0);
    load();
  };

  const dismiss = async (id: string) => {
    if (!token) return;
    await api.deleteNotification(token, id);
    load();
  };

  const handleNavigate = (n: Notification) => {
    const target = navigationFromNotification(n);
    if (target && onNavigate) onNavigate(target);
  };

  if (loading) return <div className="panel-loading">Loading notifications…</div>;

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Notifications</h2>
        {unread > 0 && (
          <>
            <span className="badge accent">{unread} unread</span>
            <button className="btn-secondary" onClick={markAll}>Mark all read</button>
          </>
        )}
      </header>

      <ul className="notif-list full-panel">
        {notifications.length === 0 && <li className="empty">No notifications yet.</li>}
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onRead={markRead}
            onDismiss={dismiss}
            onNavigate={handleNavigate}
          />
        ))}
      </ul>
    </div>
  );
}
