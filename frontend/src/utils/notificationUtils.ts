import type { EntityType, Notification } from "../models/types";

export interface NotificationMeta {
  action?: string;
  invitation_token?: string;
  invitation_id?: string;
  role_name?: string;
  workspace_name?: string;
  entity_type?: string;
  entity_id?: string;
}

export function parseNotificationMetadata(notification: Notification): NotificationMeta {
  if (!notification.metadata) return {};
  try {
    return JSON.parse(notification.metadata) as NotificationMeta;
  } catch {
    return {};
  }
}

export function isInviteNotification(notification: Notification): boolean {
  if (notification.type === "invite") return true;
  const meta = parseNotificationMetadata(notification);
  return meta.action === "workspace_invite" && Boolean(meta.invitation_token);
}

export function isAssignmentNotification(notification: Notification): boolean {
  return notification.type === "assignment";
}

export function notificationEntityLink(notification: Notification): string | null {
  const type = notification.entity_type as EntityType | null;
  const id = notification.entity_id;
  if (!type || !id) return null;
  if (type === "task") return `/tasks/${id}`;
  if (type === "issue") return `/issues/${id}`;
  if (type === "subtask") return `/subtasks`;
  if (type === "workspace") return `/workspaces/${id}`;
  if (type === "file") return `/files`;
  if (type === "comment") return null;
  return null;
}

export function notificationTypeClass(type: string): string {
  switch (type) {
    case "assignment": return "notif-type-assignment";
    case "invite": return "notif-type-invite";
    case "task": return "notif-type-task";
    case "issue": return "notif-type-issue";
    case "subtask": return "notif-type-subtask";
    case "comment": return "notif-type-comment";
    case "file": return "notif-type-file";
    case "warning": return "notif-type-warning";
    case "success": return "notif-type-success";
    default: return "notif-type-default";
  }
}
