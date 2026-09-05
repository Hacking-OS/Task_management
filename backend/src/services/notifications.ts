import { db } from "../db.js";
import type { Notification, NotifyInput, NotificationType } from "../types.js";
import { emitNotification, emitNotificationRemoved, emitUnreadSync } from "../socket.js";

function safeEmitUnreadSync(userId: string, count?: number): void {
  try {
    emitUnreadSync(userId, count ?? unreadCount(userId));
  } catch {
    // Realtime sync must not break REST handlers.
  }
}

function safeEmitNotificationRemoved(userId: string, id: string): void {
  try {
    emitNotificationRemoved(userId, id, unreadCount(userId));
  } catch {
    // Realtime sync must not break REST handlers.
  }
}

export function notify(input: NotifyInput): Notification {
  const id = crypto.randomUUID();
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
  db.prepare(`
    INSERT INTO notifications (id, user_id, workspace_id, entity_type, entity_id, type, title, message, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.userId,
    input.workspaceId ?? null,
    input.entityType ?? null,
    input.entityId ?? null,
    input.type,
    input.title,
    input.message,
    metadata
  );
  const notification = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Notification;
  emitNotification(input.userId, notification, unreadCount(input.userId));
  return notification;
}

/** @deprecated Use notify() — kept for minimal diff during migration */
export function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = "info"
): Notification {
  return notify({ userId, title, message, type });
}

export function listNotifications(userId: string, unreadOnly = false, workspaceId?: string): Notification[] {
  const conditions = ["user_id = ?"];
  const params: unknown[] = [userId];

  if (unreadOnly) conditions.push("is_read = 0");
  if (workspaceId) {
    conditions.push("(workspace_id = ? OR workspace_id IS NULL)");
    params.push(workspaceId);
  }

  return db
    .prepare(`SELECT * FROM notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 100`)
    .all(...params) as Notification[];
}

export function markNotificationRead(userId: string, id: string): boolean {
  const result = db
    .prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
    .run(id, userId);
  if (result.changes > 0) {
    safeEmitUnreadSync(userId);
  }
  return result.changes > 0;
}

export function markAllNotificationsRead(userId: string): void {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(userId);
  safeEmitUnreadSync(userId, 0);
}

export function deleteNotification(userId: string, id: string): boolean {
  const result = db
    .prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?")
    .run(id, userId);
  if (result.changes > 0) {
    safeEmitNotificationRemoved(userId, id);
  }
  return result.changes > 0;
}

export function unreadCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0")
    .get(userId) as { count: number };
  return row.count;
}

export function checkDueTaskNotifications(userId: string): void {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const dueSoon = db.prepare(`
    SELECT * FROM tasks
    WHERE user_id = ? AND status != 'done' AND due_date IS NOT NULL
      AND due_date <= ? AND due_date >= datetime('now')
  `).all(userId, in24h) as { id: string; title: string; workspace_id: string | null; due_date: string }[];

  for (const task of dueSoon) {
    const exists = db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ? AND entity_type = 'task' AND entity_id = ? AND type = 'warning'
        AND created_at >= datetime('now', '-1 day')
    `).get(userId, task.id);
    if (!exists) {
      notify({
        userId,
        type: "warning",
        title: "Task due soon",
        message: `"${task.title}" is due ${new Date(task.due_date).toLocaleString()}`,
        workspaceId: task.workspace_id,
        entityType: "task",
        entityId: task.id,
      });
    }
  }

  const overdue = db.prepare(`
    SELECT * FROM tasks
    WHERE user_id = ? AND status != 'done' AND due_date IS NOT NULL AND due_date < datetime('now')
  `).all(userId) as { id: string; title: string; workspace_id: string | null }[];

  for (const task of overdue) {
    const exists = db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ? AND entity_type = 'task' AND entity_id = ? AND type = 'warning'
        AND title = 'Task overdue' AND created_at >= datetime('now', '-1 day')
    `).get(userId, task.id);
    if (!exists) {
      notify({
        userId,
        type: "warning",
        title: "Task overdue",
        message: `"${task.title}" is past its due date.`,
        workspaceId: task.workspace_id,
        entityType: "task",
        entityId: task.id,
      });
    }
  }
}
