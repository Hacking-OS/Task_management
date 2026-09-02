import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { getStakeholderUserIds } from "./entityStakeholders.js";
import type { AssignableEntityType } from "./entityAssignments.js";
import type { EntityType, NotificationType } from "../types.js";

export function notifyStakeholders(opts: {
  actorUserId: string;
  workspaceId: string | null | undefined;
  entityType: EntityType;
  entityId: string;
  stakeholderEntityType: AssignableEntityType;
  stakeholderEntityId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  excludeUserIds?: string[];
}): void {
  const exclude = new Set([opts.actorUserId, ...(opts.excludeUserIds ?? [])]);
  for (const userId of getStakeholderUserIds(opts.stakeholderEntityType, opts.stakeholderEntityId)) {
    if (exclude.has(userId)) continue;
    notify({
      userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      workspaceId: opts.workspaceId ?? undefined,
      entityType: opts.entityType,
      entityId: opts.entityId,
      metadata: opts.metadata,
    });
  }
}

export function logEntityActivity(opts: {
  userId: string;
  workspaceId: string | null | undefined;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}): void {
  ActivityLogger.log({
    userId: opts.userId,
    workspaceId: opts.workspaceId ?? undefined,
    entityType: opts.entityType,
    entityId: opts.entityId,
    action: opts.action,
    description: opts.description,
    metadata: opts.metadata,
  });
}

export function resolveCommentParent(
  entityType: string,
  entityId: string
): { type: AssignableEntityType; id: string } | null {
  if (entityType === "task" || entityType === "issue" || entityType === "subtask") {
    return { type: entityType, id: entityId };
  }
  return null;
}

/** Resolve file attachment to the work item stakeholders should hear about. */
export function resolveFileStakeholderTarget(
  category: string,
  entityId: string
): { type: AssignableEntityType; id: string } | null {
  if (category === "task" || category === "issue" || category === "subtask") {
    return { type: category, id: entityId };
  }
  if (category === "comment") {
    const comment = db.prepare("SELECT entity_type, entity_id FROM comments WHERE id = ?").get(entityId) as
      | { entity_type: string; entity_id: string }
      | undefined;
    if (!comment) return null;
    return resolveCommentParent(comment.entity_type, comment.entity_id);
  }
  return null;
}

export function notifyEntityWatchers(
  actorUserId: string,
  workspaceId: string | null | undefined,
  entityType: AssignableEntityType,
  entityId: string,
  entityTitle: string,
  event: "created" | "updated" | "deleted" | "assigned" | "status_changed" | "comment_added" | "comment_deleted" | "file_uploaded" | "file_deleted",
  excludeUserIds: string[] = []
): void {
  const notificationType: NotificationType =
    entityType === "task" ? "task" : entityType === "issue" ? "issue" : "subtask";

  const titles: Record<typeof event, string> = {
    created: `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)} created`,
    updated: `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)} updated`,
    deleted: `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)} deleted`,
    assigned: `Assignment updated`,
    status_changed: `Status changed`,
    comment_added: "New comment",
    comment_deleted: "Comment removed",
    file_uploaded: "File attached",
    file_deleted: "File removed",
  };

  const messages: Record<typeof event, string> = {
    created: `"${entityTitle}" was created.`,
    updated: `"${entityTitle}" was updated.`,
    deleted: `"${entityTitle}" was deleted.`,
    assigned: `Assignees were updated on "${entityTitle}".`,
    status_changed: `"${entityTitle}" had a status change.`,
    comment_added: `A new comment was added on "${entityTitle}".`,
    comment_deleted: `A comment was removed from "${entityTitle}".`,
    file_uploaded: `A file was attached to "${entityTitle}".`,
    file_deleted: `A file was removed from "${entityTitle}".`,
  };

  notifyStakeholders({
    actorUserId,
    workspaceId,
    entityType: notificationType,
    entityId,
    stakeholderEntityType: entityType,
    stakeholderEntityId: entityId,
    type: event === "assigned" ? "assignment" : event.startsWith("comment") ? "comment" : event.startsWith("file") ? "file" : notificationType,
    title: titles[event],
    message: messages[event],
    excludeUserIds,
  });
}
