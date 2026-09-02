import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import type { Notification, NavigationTarget } from "../types";
import { navigationFromNotification } from "../utils/navigation";
import { NotificationItem } from "./NotificationItem";

interface Props {
  workspaceId?: string;
  onNavigate: (target: NavigationTarget) => void;
}

export function NotificationCenter({ workspaceId, onNavigate }: Props) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api.getNotifications(token, workspaceId)
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnread(unreadCount);
      })
      .finally(() => setLoading(false));
  }, [token, workspaceId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

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
    if (target) {
      onNavigate(target);
      setOpen(false);
    }
  };

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        type="button"
        className="bell-btn"
        title="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
      >
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="notification-dropdown">
          <header className="dropdown-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="link-btn" onClick={markAll}>Mark all read</button>
            )}
          </header>
          {loading ? (
            <p className="dropdown-empty">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="dropdown-empty">No notifications</p>
          ) : (
            <ul className="dropdown-list">
              {notifications.slice(0, 20).map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={markRead}
                  onDismiss={dismiss}
                  onNavigate={handleNavigate}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
