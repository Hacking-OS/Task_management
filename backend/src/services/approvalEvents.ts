import { db } from "../db.js";
import { emitApprovalChanged } from "../socket.js";
import { canDecideApproval } from "./permissionResolver.js";
import type { ApprovalRequestDetails } from "./approvalFlows.js";

export type ApprovalChangeAction = "created" | "approved" | "rejected" | "executed";

function recipientsForApproval(
  workspaceId: string,
  permissionCode: string,
  requesterId: string
): Set<string> {
  const recipients = new Set<string>([requesterId]);
  const members = db.prepare(`
    SELECT user_id FROM workspace_members WHERE workspace_id = ?
  `).all(workspaceId) as { user_id: string }[];

  for (const member of members) {
    if (canDecideApproval(member.user_id, workspaceId, permissionCode)) {
      recipients.add(member.user_id);
    }
  }
  return recipients;
}

export function broadcastApprovalChange(
  workspaceId: string,
  action: ApprovalChangeAction,
  request: ApprovalRequestDetails,
  actorUserId?: string
): void {
  const payload = {
    workspaceId,
    action,
    permissionCode: request.permission_code,
    requesterId: request.requester_id,
    actorUserId: actorUserId ?? null,
    request: {
      id: request.id,
      permission_code: request.permission_code,
      permission_name: request.permission_name,
      title: request.title,
      status: request.status,
      requester_username: request.requester_username,
      attempt_number: request.attempt_number,
    },
  };

  const recipients = recipientsForApproval(workspaceId, request.permission_code, request.requester_id);
  if (actorUserId) recipients.add(actorUserId);

  for (const userId of recipients) {
    emitApprovalChanged(userId, payload);
  }
}
