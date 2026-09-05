import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Notification } from "../models/types";
import { formatDate } from "../utils/severity";
import {
  isAssignmentNotification,
  isInviteNotification,
  notificationEntityLink,
  notificationTypeClass,
  parseNotificationMetadata,
} from "../utils/notificationUtils";
import { Icon, notificationIconName } from "./icons/Icon";

interface NotificationItemProps {
  notification: Notification;
  compact?: boolean;
  onRead?: (id: string) => void | Promise<void>;
  onDismiss?: (id: string) => void | Promise<void>;
  onAcceptInvite?: (token: string, notificationId: string) => void | Promise<void>;
  onRejectInvite?: (token: string, notificationId: string) => void | Promise<void>;
  onClose?: () => void;
}

export function NotificationItem({
  notification: n,
  compact,
  onRead,
  onDismiss,
  onAcceptInvite,
  onRejectInvite,
  onClose,
}: NotificationItemProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"accept" | "reject" | "open" | null>(null);
  const meta = parseNotificationMetadata(n);
  const invite = isInviteNotification(n);
  const assignment = isAssignmentNotification(n);
  const link = notificationEntityLink(n);
  const typeClass = notificationTypeClass(n.type);

  const markReadIfNeeded = async () => {
    if (!n.is_read && onRead && n.id?.trim()) {
      try {
        await onRead(n.id);
      } catch {
        // NotificationContext handles API errors.
      }
    }
  };

  const openEntity = async () => {
    if (!link) return;
    setBusy("open");
    try {
      await markReadIfNeeded();
      onClose?.();
      navigate(link);
    } finally {
      setBusy(null);
    }
  };

  const acceptInvite = async () => {
    const token = meta.invitation_token;
    if (!token || !onAcceptInvite) return;
    setBusy("accept");
    try {
      await onAcceptInvite(token, n.id);
    } finally {
      setBusy(null);
    }
  };

  const rejectInvite = async () => {
    const token = meta.invitation_token;
    if (!token || !onRejectInvite) return;
    setBusy("reject");
    try {
      await onRejectInvite(token, n.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={`notif-item${n.is_read ? "" : " unread"}${compact ? " compact" : ""} ${typeClass}`}>
      <div className="notif-item-main">
        <span className={`notif-item-icon ${typeClass}`}>
          <Icon name={notificationIconName(n.type)} size={compact ? 16 : 18} />
        </span>
        <div className="notif-item-body">
          <strong>{n.title}</strong>
          <p>{n.message}</p>
          <time>{formatDate(n.created_at)}</time>
        </div>
      </div>

      <div className="notif-item-actions">
        {invite && onAcceptInvite && onRejectInvite && (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary notif-action-btn"
              disabled={busy !== null}
              onClick={acceptInvite}
            >
              {busy === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary notif-action-btn"
              disabled={busy !== null}
              onClick={rejectInvite}
            >
              {busy === "reject" ? "Declining…" : "Decline"}
            </button>
          </>
        )}

        {assignment && link && (
          <button
            type="button"
            className="btn btn-sm btn-primary notif-action-btn"
            disabled={busy !== null}
            onClick={openEntity}
          >
            {busy === "open" ? "Opening…" : "View assignment"}
          </button>
        )}

        {!invite && !assignment && link && (
          <Link
            to={link}
            className="btn btn-sm btn-secondary notif-action-btn"
            onClick={() => { void markReadIfNeeded(); onClose?.(); }}
          >
            Open
          </Link>
        )}

        {!compact && !n.is_read && onRead && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void onRead(n.id)}>Mark read</button>
        )}
        {!compact && onDismiss && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void onDismiss(n.id)}>Dismiss</button>
        )}
      </div>
    </article>
  );
}
