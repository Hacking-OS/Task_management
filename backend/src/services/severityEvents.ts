import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import {
  formatSeverity,
  shouldNotifySeverityChange,
  shortEntityId,
} from "../validation/severity.js";
import type { EntityType, Severity } from "../types.js";

interface SeverityChangeContext {
  userId: string;
  entityType: Extract<EntityType, "task" | "issue" | "subtask">;
  entityId: string;
  entityTitle: string;
  workspaceId: string | null;
  assigneeId: string | null;
  oldSeverity: Severity;
  newSeverity: Severity;
}

export function recordSeverityChange(ctx: SeverityChangeContext): void {
  if (ctx.oldSeverity === ctx.newSeverity) return;

  const oldLabel = formatSeverity(ctx.oldSeverity);
  const newLabel = formatSeverity(ctx.newSeverity);
  const shortId = shortEntityId(ctx.entityId);
  const entityName = ctx.entityType.charAt(0).toUpperCase() + ctx.entityType.slice(1);

  ActivityLogger.log({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    action: "severity_changed",
    description: `${entityName} #${shortId} severity changed from ${oldLabel} to ${newLabel}`,
    metadata: { old_severity: oldLabel, new_severity: newLabel },
  });

  if (!shouldNotifySeverityChange(ctx.oldSeverity, ctx.newSeverity)) return;

  const title =
    ctx.newSeverity === "critical"
      ? `${entityName} severity changed to Critical`
      : `${entityName} severity changed from ${oldLabel} to ${newLabel}`;

  const message = `"${ctx.entityTitle}" severity is now ${newLabel}.`;
  const notifyTargets = new Set<string>([ctx.userId]);
  if (ctx.assigneeId) notifyTargets.add(ctx.assigneeId);

  for (const targetId of notifyTargets) {
    notify({
      userId: targetId,
      type: ctx.entityType,
      title,
      message,
      workspaceId: ctx.workspaceId,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
    });
  }
}
