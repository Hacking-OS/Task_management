import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import { NotificationItem } from "./NotificationItem";
import { Icon } from "./icons/Icon";

export function NotificationBell() {
  const {
    bellNotifications,
    unreadCount,
    ringing,
    toast,
    markRead,
    acceptInvite,
    rejectInvite,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleAcceptInvite = async (inviteToken: string, notificationId: string) => {
    await acceptInvite(inviteToken, notificationId);
    setOpen(false);
  };

  return (
    <div className="notification-bell" ref={ref}>
      {toast && (
        <div className="notif-toast" role="status">
          <span className="notif-toast-icon"><Icon name="notifications" size={16} /></span>
          <div>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`bell-btn${ringing ? " ringing" : ""}${unreadCount > 0 ? " has-unread" : ""}`}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="notifications" size={18} className="bell-icon" />
        {unreadCount > 0 && (
          <span className="bell-count" key={unreadCount}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="bell-dropdown card bell-dropdown-enter">
          <div className="bell-dropdown-header">
            <strong>Notifications</strong>
            <Link to="/notifications" onClick={() => setOpen(false)}>View all</Link>
          </div>
          {bellNotifications.length === 0 ? (
            <p className="muted pad-sm">No notifications</p>
          ) : (
            <ul className="bell-list">
              {bellNotifications.map((n, i) => (
                <li key={n.id} className="bell-list-item" style={{ animationDelay: `${i * 40}ms` }}>
                  <NotificationItem
                    notification={n}
                    compact
                    onRead={markRead}
                    onAcceptInvite={handleAcceptInvite}
                    onRejectInvite={rejectInvite}
                    onClose={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
