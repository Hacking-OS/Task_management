import { db } from "../db.js";
import { PERMISSION_CATALOG } from "../permissions/catalog.js";
import { ActivityLogger } from "./activityLogger.js";
import {
  ForbiddenError,
  getMembership,
  isWorkspaceCreator,
  requireMembership,
  getEffectivePermissions,
  isWorkspaceOwner,
} from "./authorization.js";
import { getMemberOverrideSets, setMemberPermissionOverrides, type MemberPermissionOverride } from "./memberPermissions.js";
import { syncMemberPermissionChange } from "./permissionEvents.js";
import { notify } from "./notifications.js";
import { canDecideApproval, resolvePermission } from "./permissionResolver.js";
import { broadcastApprovalChange } from "./approvalEvents.js";
import { requireApprovalDecisionAuthority, ConflictError } from "./authorizationService.js";
import { logSecurityEvent } from "./securityEvents.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "executed" | "failed";

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  requester_id: string;
  approver_id: string;
  permission_code: string;
  title: string;
  description: string;
  status: ApprovalStatus;
  resolution_note: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  request_type: string;
  target_type: string | null;
  target_id: string | null;
  action: string | null;
  payload_json: string;
  attempt_number: number;
  previous_request_id: string | null;
  decided_by: string | null;
  metadata: string;
}

export interface ApprovalRequestDetails extends ApprovalRequest {
  requester_username: string;
  requester_email: string;
  permission_name: string;
}

function permissionLabel(code: string): string {
  return PERMISSION_CATALOG.find((p) => p.code === code)?.name ?? code;
}

export function getWorkspaceCreatorId(workspaceId: string): string {
  const ws = db.prepare("SELECT user_id FROM workspaces WHERE id = ?").get(workspaceId) as { user_id: string } | undefined;
  if (!ws) throw new Error("Workspace not found");
  return ws.user_id;
}

export function isApprovalFlowsEnabled(workspaceId: string): boolean {
  const ws = db.prepare("SELECT approval_flows_enabled FROM workspaces WHERE id = ?").get(workspaceId) as
    | { approval_flows_enabled: number }
    | undefined;
  return ws?.approval_flows_enabled !== 0;
}

export function setApprovalFlowsEnabled(actorUserId: string, workspaceId: string, enabled: boolean): void {
  if (!isWorkspaceOwner(actorUserId, workspaceId) && !isWorkspaceCreator(actorUserId, workspaceId)) {
    throw new ForbiddenError("Only the workspace owner can change approval flow settings");
  }
  db.prepare(`
    UPDATE workspaces SET approval_flows_enabled = ?, updated_at = datetime('now') WHERE id = ?
  `).run(enabled ? 1 : 0, workspaceId);
}

function notifyDeciders(workspaceId: string, permissionCode: string, message: string, metadata: Record<string, unknown>): void {
  const members = db.prepare(`
    SELECT m.user_id, r.slug AS role_slug FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ?
  `).all(workspaceId) as { user_id: string; role_slug: string }[];

  for (const member of members) {
    if (canDecideApproval(member.user_id, workspaceId, permissionCode)) {
      notify({
        userId: member.user_id,
        type: "info",
        title: "Approval requested",
        message,
        workspaceId,
        entityType: "workspace",
        entityId: workspaceId,
        metadata,
      });
    }
  }
}

export function createApprovalRequest(
  requesterId: string,
  workspaceId: string,
  permissionCode: string,
  title: string,
  description = ""
): ApprovalRequest {
  requireMembership(requesterId, workspaceId);

  if (!isApprovalFlowsEnabled(workspaceId)) {
    throw new Error("Approval flows are disabled for this workspace");
  }

  const valid = PERMISSION_CATALOG.some((p) => p.code === permissionCode);
  if (!valid) throw new Error("Invalid permission code");

  const resolution = resolvePermission(requesterId, workspaceId, permissionCode);
  if (resolution.allowed) {
    throw new Error("You already have this permission");
  }
  if (resolution.denied && !resolution.requiresApproval) {
    throw new ForbiddenError("This permission is denied and cannot be requested");
  }

  const existing = db.prepare(`
    SELECT id FROM approval_requests
    WHERE workspace_id = ? AND requester_id = ? AND permission_code = ? AND status = 'pending'
  `).get(workspaceId, requesterId, permissionCode) as { id: string } | undefined;
  if (existing) throw new Error("A pending approval request already exists for this permission");

  const lastAttempt = db.prepare(`
    SELECT id, attempt_number FROM approval_requests
    WHERE workspace_id = ? AND requester_id = ? AND permission_code = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(workspaceId, requesterId, permissionCode) as { id: string; attempt_number: number } | undefined;

  const approverId = getWorkspaceCreatorId(workspaceId);
  const id = crypto.randomUUID();
  const attemptNumber = (lastAttempt?.attempt_number ?? 0) + 1;

  db.prepare(`
    INSERT INTO approval_requests (
      id, workspace_id, requester_id, approver_id, permission_code, title, description, status,
      request_type, attempt_number, previous_request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'permission_grant', ?, ?)
  `).run(
    id,
    workspaceId,
    requesterId,
    approverId,
    permissionCode,
    title.trim(),
    description.trim(),
    attemptNumber,
    lastAttempt?.id ?? null
  );

  const request = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(id) as ApprovalRequest;
  const requester = db.prepare("SELECT username FROM users WHERE id = ?").get(requesterId) as { username: string };
  const workspace = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(workspaceId) as { name: string };

  notifyDeciders(
    workspaceId,
    permissionCode,
    `${requester.username} requested permission: ${permissionLabel(permissionCode)}.`,
    {
      action: "approval_requested",
      approval_request_id: id,
      permission_code: permissionCode,
      requester_username: requester.username,
      workspace_name: workspace.name,
    }
  );

  ActivityLogger.log({
    userId: requesterId,
    workspaceId,
    entityType: "workspace",
    entityId: workspaceId,
    action: "approval_requested",
    description: `Requested approval for ${permissionLabel(permissionCode)}`,
    metadata: { approval_request_id: id, permission_code: permissionCode, attempt_number: attemptNumber },
  });

  const details = getRequestDetails(id);
  broadcastApprovalChange(workspaceId, "created", details, requesterId);
  return request;
}

export function getRequestDetails(requestId: string): ApprovalRequestDetails {
  const row = db.prepare(`
    SELECT ar.*, u.username AS requester_username, u.email AS requester_email
    FROM approval_requests ar
    JOIN users u ON u.id = ar.requester_id
    WHERE ar.id = ?
  `).get(requestId) as (ApprovalRequest & { requester_username: string; requester_email: string }) | undefined;
  if (!row) throw new Error("Approval request not found");
  return mapRequest(row);
}

function mapRequest(row: ApprovalRequest & { requester_username: string; requester_email: string }): ApprovalRequestDetails {
  return {
    ...row,
    permission_name: permissionLabel(row.permission_code),
  };
}

export function listPendingApprovalsForDecider(userId: string, workspaceId: string): ApprovalRequestDetails[] {
  requireMembership(userId, workspaceId);

  const rows = db.prepare(`
    SELECT ar.*, u.username AS requester_username, u.email AS requester_email
    FROM approval_requests ar
    JOIN users u ON u.id = ar.requester_id
    WHERE ar.workspace_id = ? AND ar.status = 'pending'
    ORDER BY ar.created_at DESC
  `).all(workspaceId) as (ApprovalRequest & { requester_username: string; requester_email: string })[];

  return rows
    .filter((row) => canDecideApproval(userId, workspaceId, row.permission_code))
    .map(mapRequest);
}

/** @deprecated Use listPendingApprovalsForDecider */
export function listPendingApprovalsForCreator(creatorId: string, workspaceId: string): ApprovalRequestDetails[] {
  return listPendingApprovalsForDecider(creatorId, workspaceId);
}

export function listAllApprovals(
  userId: string,
  workspaceId: string,
  filters?: { status?: ApprovalStatus; mine?: boolean }
): ApprovalRequestDetails[] {
  requireMembership(userId, workspaceId);

  let sql = `
    SELECT ar.*, u.username AS requester_username, u.email AS requester_email
    FROM approval_requests ar
    JOIN users u ON u.id = ar.requester_id
    WHERE ar.workspace_id = ?
  `;
  const params: unknown[] = [workspaceId];

  if (filters?.mine) {
    sql += " AND ar.requester_id = ?";
    params.push(userId);
  }
  if (filters?.status) {
    sql += " AND ar.status = ?";
    params.push(filters.status);
  }
  sql += " ORDER BY ar.created_at DESC LIMIT 100";

  const rows = db.prepare(sql).all(...params) as (ApprovalRequest & {
    requester_username: string;
    requester_email: string;
  })[];

  if (filters?.mine) return rows.map(mapRequest);

  return rows
    .filter(
      (row) =>
        row.requester_id === userId || canDecideApproval(userId, workspaceId, row.permission_code)
    )
    .map(mapRequest);
}

export function listMyApprovalRequests(userId: string, workspaceId: string): ApprovalRequestDetails[] {
  return listAllApprovals(userId, workspaceId, { mine: true });
}

export function approveRequest(resolverId: string, requestId: string): ApprovalRequestDetails {
  const request = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(requestId) as ApprovalRequest | undefined;
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("Request is no longer pending");

  requireApprovalDecisionAuthority(resolverId, request.workspace_id, request.permission_code);

  const membership = getMembership(request.requester_id, request.workspace_id);
  if (!membership) {
    db.prepare(`
      UPDATE approval_requests SET status = 'failed', resolution_note = 'Requester no longer a member',
        resolved_at = datetime('now'), updated_at = datetime('now'), decided_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(resolverId, requestId);
    throw new Error("Requester is no longer a workspace member");
  }

  const currentResolution = resolvePermission(request.requester_id, request.workspace_id, request.permission_code);
  if (currentResolution.allowed) {
    db.prepare(`
      UPDATE approval_requests SET status = 'cancelled', resolution_note = 'Requester already has permission',
        resolved_at = datetime('now'), updated_at = datetime('now'), decided_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(resolverId, requestId);
    throw new Error("Requester already has this permission");
  }
  if (currentResolution.denied && !currentResolution.requiresApproval) {
    db.prepare(`
      UPDATE approval_requests SET status = 'failed', resolution_note = 'Permission is now denied',
        resolved_at = datetime('now'), updated_at = datetime('now'), decided_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(resolverId, requestId);
    throw new ForbiddenError("Cannot approve — permission is now denied for the requester");
  }

  const before = getEffectivePermissions(request.requester_id, request.workspace_id);
  const { grants, denies } = getMemberOverrideSets(membership.id);
  const nextOverrides: MemberPermissionOverride[] = [
    ...grants.map((code) => ({ permission_code: code, effect: "grant" as const })),
    ...denies.filter((code) => code !== request.permission_code).map((code) => ({ permission_code: code, effect: "deny" as const })),
  ];
  if (!grants.includes(request.permission_code)) {
    nextOverrides.push({ permission_code: request.permission_code, effect: "grant" });
  }

  const tx = db.transaction(() => {
    const lock = db.prepare(`
      SELECT id FROM approval_requests WHERE id = ? AND status = 'pending'
    `).get(requestId) as { id: string } | undefined;
    if (!lock) throw new ConflictError("Approval request was already decided");

    setMemberPermissionOverrides(request.workspace_id, membership.id, nextOverrides);

    const updated = db.prepare(`
      UPDATE approval_requests
      SET status = 'executed', resolved_at = datetime('now'), updated_at = datetime('now'), decided_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(resolverId, requestId);

    if (updated.changes === 0) throw new ConflictError("Approval request was already decided");
  });

  tx();

  syncMemberPermissionChange(request.workspace_id, request.requester_id, before, resolverId);

  logSecurityEvent({
    actorUserId: resolverId,
    workspaceId: request.workspace_id,
    action: "APPROVAL_GRANTED",
    resourceType: "approval",
    resourceId: requestId,
    result: "SUCCESS",
    reason: `Approved ${request.permission_code}`,
    riskLevel: "INFO",
    metadata: { permission_code: request.permission_code, requester_id: request.requester_id },
  });

  notify({
    userId: request.requester_id,
    type: "success",
    title: "Approval granted",
    message: `Your request for "${permissionLabel(request.permission_code)}" was approved.`,
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.workspace_id,
    metadata: { action: "approval_granted", approval_request_id: requestId, permission_code: request.permission_code },
  });

  ActivityLogger.log({
    userId: resolverId,
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.workspace_id,
    action: "approval_granted",
    description: `Approved permission request: ${permissionLabel(request.permission_code)}`,
    metadata: { approval_request_id: requestId, requester_id: request.requester_id },
  });

  const updated = db.prepare(`
    SELECT ar.*, u.username AS requester_username, u.email AS requester_email
    FROM approval_requests ar
    JOIN users u ON u.id = ar.requester_id
    WHERE ar.id = ?
  `).get(requestId) as ApprovalRequest & { requester_username: string; requester_email: string };

  const details = mapRequest(updated);
  broadcastApprovalChange(request.workspace_id, "executed", details, resolverId);
  return details;
}

export function rejectRequest(resolverId: string, requestId: string, note = ""): ApprovalRequestDetails {
  const request = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(requestId) as ApprovalRequest | undefined;
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("Request is no longer pending");

  requireApprovalDecisionAuthority(resolverId, request.workspace_id, request.permission_code);

  const result = db.prepare(`
    UPDATE approval_requests
    SET status = 'rejected', resolution_note = ?, resolved_at = datetime('now'),
        updated_at = datetime('now'), decided_by = ?
    WHERE id = ? AND status = 'pending'
  `).run(note.trim(), resolverId, requestId);

  if (result.changes === 0) throw new ConflictError("Approval request was already decided");

  logSecurityEvent({
    actorUserId: resolverId,
    workspaceId: request.workspace_id,
    action: "APPROVAL_REJECTED",
    resourceType: "approval",
    resourceId: requestId,
    result: "SUCCESS",
    reason: note.trim() || "Rejected",
    riskLevel: "INFO",
    metadata: { permission_code: request.permission_code, requester_id: request.requester_id },
  });

  notify({
    userId: request.requester_id,
    type: "warning",
    title: "Approval rejected",
    message: `Your request for "${permissionLabel(request.permission_code)}" was rejected.${note.trim() ? ` Note: ${note.trim()}` : ""}`,
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.workspace_id,
    metadata: { action: "approval_rejected", approval_request_id: requestId, permission_code: request.permission_code },
  });

  ActivityLogger.log({
    userId: resolverId,
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.workspace_id,
    action: "approval_rejected",
    description: `Rejected permission request: ${permissionLabel(request.permission_code)}`,
    metadata: { approval_request_id: requestId, requester_id: request.requester_id },
  });

  const updated = db.prepare(`
    SELECT ar.*, u.username AS requester_username, u.email AS requester_email
    FROM approval_requests ar
    JOIN users u ON u.id = ar.requester_id
    WHERE ar.id = ?
  `).get(requestId) as ApprovalRequest & { requester_username: string; requester_email: string };

  const details = mapRequest(updated);
  broadcastApprovalChange(request.workspace_id, "rejected", details, resolverId);
  return details;
}
