import { db } from "../db.js";
import type { ActivityInput, ActivityLog } from "../types.js";
import { requirePermission } from "./authorization.js";

/** Immutable workspace activity audit trail. */
export class ActivityLogger {
  static log(input: ActivityInput): ActivityLog {
    const id = crypto.randomUUID();
    const metadata = JSON.stringify(input.metadata ?? {});
    db.prepare(`
      INSERT INTO activity_logs (id, workspace_id, user_id, entity_type, entity_id, action, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.workspaceId ?? null,
      input.userId,
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.description,
      metadata
    );
    return db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(id) as ActivityLog;
  }

  static list(filters: {
    userId: string;
    workspaceId?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
  }): ActivityLog[] {
    const limit = filters.limit ?? 100;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.workspaceId) {
      requirePermission(filters.userId, filters.workspaceId, "activity.view");
      conditions.push("workspace_id = ?");
      params.push(filters.workspaceId);
    } else {
      conditions.push("user_id = ?");
      params.push(filters.userId);
    }
    if (filters.entityType) {
      conditions.push("entity_type = ?");
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push("entity_id = ?");
      params.push(filters.entityId);
    }

    params.push(limit);
    return db
      .prepare(`SELECT * FROM activity_logs WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`)
      .all(...params) as ActivityLog[];
  }

  static forEntity(userId: string, entityType: string, entityId: string): ActivityLog[] {
    const workspaceId = ActivityLogger.resolveEntityWorkspaceId(entityType, entityId);
    if (!workspaceId) return [];
    return ActivityLogger.list({ userId, workspaceId, entityType, entityId, limit: 50 });
  }

  private static resolveEntityWorkspaceId(entityType: string, entityId: string): string | undefined {
    if (entityType === "task") {
      return (db.prepare("SELECT workspace_id FROM tasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined)?.workspace_id;
    }
    if (entityType === "issue") {
      return (db.prepare("SELECT workspace_id FROM issues WHERE id = ?").get(entityId) as { workspace_id: string } | undefined)?.workspace_id;
    }
    if (entityType === "subtask") {
      return (db.prepare("SELECT workspace_id FROM subtasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined)?.workspace_id;
    }
    if (entityType === "comment") {
      return (db.prepare("SELECT workspace_id FROM comments WHERE id = ?").get(entityId) as { workspace_id: string } | undefined)?.workspace_id;
    }
    return undefined;
  }
}
