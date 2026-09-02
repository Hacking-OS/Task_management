import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { requirePermission } from "./authorization.js";
import { validateCommentBody, validateCommentEntityType, validateEntityId } from "../validation/common.js";
import { logEntityActivity, notifyEntityWatchers, resolveCommentParent } from "./entityEvents.js";
import type { Comment, EntityType } from "../types.js";

function commentPermissionForEntity(entityType: string): string {
  if (entityType === "task") return "task.add_comment";
  if (entityType === "issue") return "issue.add_comment";
  return "comment.create";
}

function assertEntityInWorkspace(entityType: string, entityId: string, workspaceId: string): void {
  if (entityType === "task") {
    const row = db.prepare("SELECT workspace_id FROM tasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
    if (!row || row.workspace_id !== workspaceId) throw new Error("Task not found in workspace");
    return;
  }
  if (entityType === "issue") {
    const row = db.prepare("SELECT workspace_id FROM issues WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
    if (!row || row.workspace_id !== workspaceId) throw new Error("Issue not found in workspace");
    return;
  }
  const row = db.prepare("SELECT workspace_id FROM subtasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
  if (!row || row.workspace_id !== workspaceId) throw new Error("Subtask not found in workspace");
}

function entityTitle(entityType: string, entityId: string): string {
  if (entityType === "task") {
    const row = db.prepare("SELECT title FROM tasks WHERE id = ?").get(entityId) as { title: string } | undefined;
    return row?.title ?? entityType;
  }
  if (entityType === "issue") {
    const row = db.prepare("SELECT title FROM issues WHERE id = ?").get(entityId) as { title: string } | undefined;
    return row?.title ?? entityType;
  }
  const row = db.prepare("SELECT title FROM subtasks WHERE id = ?").get(entityId) as { title: string } | undefined;
  return row?.title ?? entityType;
}

export function listComments(userId: string, entityType: string, entityId: string): Comment[] {
  const validEntityType = validateCommentEntityType(entityType);
  const validEntityId = validateEntityId(entityId, "Entity");

  const entity = db.prepare(`
    SELECT workspace_id FROM tasks WHERE id = ? AND ? = 'task'
    UNION SELECT workspace_id FROM issues WHERE id = ? AND ? = 'issue'
    UNION SELECT workspace_id FROM subtasks WHERE id = ? AND ? = 'subtask'
  `).get(validEntityId, validEntityType, validEntityId, validEntityType, validEntityId, validEntityType) as { workspace_id: string } | undefined;

  if (entity?.workspace_id) requirePermission(userId, entity.workspace_id, "comment.view");

  return db
    .prepare("SELECT * FROM comments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC")
    .all(validEntityType, validEntityId) as Comment[];
}

export function createComment(
  userId: string,
  data: { entity_type: string; entity_id: string; body: string; workspace_id?: string; mentions?: string[] }
): Comment {
  if (!data.workspace_id) throw new Error("workspace_id is required");
  const entityType = validateCommentEntityType(data.entity_type);
  const entityId = validateEntityId(data.entity_id, "Entity");
  const body = validateCommentBody(data.body);
  assertEntityInWorkspace(entityType, entityId, data.workspace_id);
  requirePermission(userId, data.workspace_id, commentPermissionForEntity(entityType));
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO comments (id, user_id, workspace_id, entity_type, entity_id, body)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, data.workspace_id ?? null, entityType, entityId, body);

  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(id) as Comment;
  const parentTitle = entityTitle(entityType, entityId);

  ActivityLogger.log({
    userId,
    workspaceId: comment.workspace_id,
    entityType: "comment",
    entityId: comment.id,
    action: "created",
    description: `New comment on ${entityType}`,
    metadata: { parent_entity_type: entityType, parent_entity_id: entityId },
  });

  logEntityActivity({
    userId,
    workspaceId: comment.workspace_id,
    entityType,
    entityId,
    action: "comment_added",
    description: `Comment added on ${entityType} "${parentTitle}"`,
    metadata: { comment_id: comment.id, body_preview: body.slice(0, 120) },
  });

  notify({
    userId,
    type: "comment",
    title: "Comment posted",
    message: body.slice(0, 120),
    workspaceId: comment.workspace_id,
    entityType: entityType as EntityType,
    entityId,
  });

  const parent = resolveCommentParent(entityType, entityId);
  if (parent) {
    notifyEntityWatchers(userId, comment.workspace_id, parent.type, parent.id, parentTitle, "comment_added");
  }

  for (const mentionId of data.mentions ?? []) {
    if (mentionId !== userId) {
      notify({
        userId: mentionId,
        type: "mention",
        title: "You were mentioned",
        message: body.slice(0, 120),
        workspaceId: comment.workspace_id,
        entityType: entityType as EntityType,
        entityId,
      });
    }
  }
  return comment;
}

export function deleteComment(userId: string, commentId: string): void {
  const existing = db.prepare("SELECT * FROM comments WHERE id = ?").get(commentId) as Comment | undefined;
  if (!existing) throw new Error("Comment not found");
  if (existing.workspace_id) requirePermission(userId, existing.workspace_id, "comment.create");

  const result = db.prepare("DELETE FROM comments WHERE id = ? AND user_id = ?").run(commentId, userId);
  if (result.changes === 0) throw new Error("Comment not found");

  const parentTitle = entityTitle(existing.entity_type, existing.entity_id);

  ActivityLogger.log({
    userId,
    workspaceId: existing.workspace_id,
    entityType: "comment",
    entityId: commentId,
    action: "deleted",
    description: `Comment removed from ${existing.entity_type}`,
    metadata: { parent_entity_type: existing.entity_type, parent_entity_id: existing.entity_id },
  });

  logEntityActivity({
    userId,
    workspaceId: existing.workspace_id,
    entityType: existing.entity_type,
    entityId: existing.entity_id,
    action: "comment_deleted",
    description: `Comment removed from ${existing.entity_type} "${parentTitle}"`,
    metadata: { comment_id: commentId },
  });

  notify({
    userId,
    type: "comment",
    title: "Comment deleted",
    message: `Your comment on ${existing.entity_type} "${parentTitle}" was removed.`,
    workspaceId: existing.workspace_id,
    entityType: existing.entity_type as EntityType,
    entityId: existing.entity_id,
  });

  const parent = resolveCommentParent(existing.entity_type, existing.entity_id);
  if (parent) {
    notifyEntityWatchers(userId, existing.workspace_id, parent.type, parent.id, parentTitle, "comment_deleted");
  }
}
