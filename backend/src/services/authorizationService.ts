import { db } from "../db.js";
import { ForbiddenError, PermissionDeniedError } from "./authorization.js";
import { resolvePermission, canDecideApproval } from "./permissionResolver.js";
import { getMemberSecurityVersion } from "./securityVersion.js";
import { logSecurityEvent } from "./securityEvents.js";
import type { Request } from "express";

export class StaleSecurityVersionError extends ForbiddenError {
  securityVersion: number;
  clientVersion: number;

  constructor(securityVersion: number, clientVersion: number) {
    super("Security context is stale. Refresh permissions and retry.");
    this.name = "StaleSecurityVersionError";
    this.securityVersion = securityVersion;
    this.clientVersion = clientVersion;
  }
}

export class ConflictError extends Error {
  status = 409;
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export interface AuthorizeInput {
  userId: string;
  workspaceId: string;
  permission: string;
  resourceType?: string;
  resourceId?: string;
  teamId?: string;
  clientSecurityVersion?: number;
  req?: Pick<Request, "requestId" | "sessionId" | "userAgent" | "ip" | "method" | "path">;
}

export interface AuthorizeResult {
  allowed: boolean;
  requiresApproval: boolean;
  denied: boolean;
  reason: string;
  securityVersion: number;
  permission: string;
}

const ENTITY_TABLES: Record<string, string> = {
  task: "tasks",
  issue: "issues",
  subtask: "subtasks",
  team: "workspace_teams",
};

function verifyResourceInWorkspace(
  workspaceId: string,
  resourceType: string,
  resourceId: string
): boolean {
  const table = ENTITY_TABLES[resourceType];
  if (!table) return true;
  const row = db.prepare(`SELECT workspace_id FROM ${table} WHERE id = ?`).get(resourceId) as
    | { workspace_id: string | null }
    | undefined;
  return !!row?.workspace_id && row.workspace_id === workspaceId;
}

/** Central server-side authorization — always resolves fresh from DB. */
export function authorize(input: AuthorizeInput): AuthorizeResult {
  const membership = db.prepare(`
    SELECT m.id, m.role_id, r.slug AS role_slug
    FROM workspace_members m
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.workspace_id = ? AND m.user_id = ?
  `).get(input.workspaceId, input.userId) as { id: string; role_id: string; role_slug: string } | undefined;

  const securityVersion = getMemberSecurityVersion(input.workspaceId, input.userId);

  if (!membership) {
    logDenial(input, "WORKSPACE_ACCESS_DENIED", "Not a workspace member", 403, "MEDIUM");
    return {
      allowed: false,
      requiresApproval: false,
      denied: true,
      reason: "Not a workspace member",
      securityVersion: 0,
      permission: input.permission,
    };
  }

  if (
    input.clientSecurityVersion !== undefined &&
    input.clientSecurityVersion > 0 &&
    input.clientSecurityVersion !== securityVersion
  ) {
    logDenial(input, "STALE_SECURITY_VERSION", "Client security version mismatch", 409, "LOW");
  }

  if (input.resourceType && input.resourceId) {
    if (!verifyResourceInWorkspace(input.workspaceId, input.resourceType, input.resourceId)) {
      logDenial(input, "RESOURCE_SCOPE_VIOLATION", "Resource not in workspace", 404, "HIGH");
      return {
        allowed: false,
        requiresApproval: false,
        denied: true,
        reason: "Resource not found",
        securityVersion,
        permission: input.permission,
      };
    }
  }

  if (input.teamId) {
    const team = db.prepare(`
      SELECT id FROM workspace_teams WHERE id = ? AND workspace_id = ?
    `).get(input.teamId, input.workspaceId);
    if (!team) {
      logDenial(input, "TEAM_ACCESS_DENIED", "Team not in workspace", 404, "MEDIUM");
      return {
        allowed: false,
        requiresApproval: false,
        denied: true,
        reason: "Team not found",
        securityVersion,
        permission: input.permission,
      };
    }
  }

  const resolution = resolvePermission(input.userId, input.workspaceId, input.permission, membership);

  if (resolution.allowed) {
    return {
      allowed: true,
      requiresApproval: false,
      denied: false,
      reason: resolution.reason,
      securityVersion,
      permission: input.permission,
    };
  }

  if (resolution.requiresApproval) {
    logDenial(input, "APPROVAL_REQUIRED", resolution.reason, 403, "INFO");
    return {
      allowed: false,
      requiresApproval: true,
      denied: false,
      reason: resolution.reason,
      securityVersion,
      permission: input.permission,
    };
  }

  logDenial(input, "PERMISSION_DENIED", resolution.reason, 403, "MEDIUM");
  return {
    allowed: false,
    requiresApproval: false,
    denied: true,
    reason: resolution.reason,
    securityVersion,
    permission: input.permission,
  };
}

export function requireAuthorize(input: AuthorizeInput): AuthorizeResult {
  const result = authorize(input);
  if (result.allowed) return result;

  if (result.requiresApproval) {
    throw new PermissionDeniedError(input.permission, input.workspaceId, true);
  }

  throw new PermissionDeniedError(input.permission, input.workspaceId, false);
}

/** Verify current approval decision authority at decision time (not stale). */
export function requireApprovalDecisionAuthority(
  userId: string,
  workspaceId: string,
  permissionCode: string,
  req?: AuthorizeInput["req"]
): void {
  if (!canDecideApproval(userId, workspaceId, permissionCode)) {
    logSecurityEvent({
      requestId: req?.requestId,
      sessionId: req?.sessionId,
      actorUserId: userId,
      workspaceId,
      userAgent: req?.userAgent,
      sourceIp: req?.ip,
      httpMethod: req?.method,
      route: req?.path,
      action: "APPROVAL_UNAUTHORIZED_DECISION",
      resourceType: "approval",
      resourceId: permissionCode,
      result: "DENIED",
      reason: "User lacks approval decision authority",
      statusCode: 403,
      riskLevel: "HIGH",
    });
    throw new ForbiddenError("You are not authorized to decide this approval request");
  }
}

function logDenial(
  input: AuthorizeInput,
  action: string,
  reason: string,
  statusCode: number,
  riskLevel: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
): void {
  logSecurityEvent({
    requestId: input.req?.requestId,
    sessionId: input.req?.sessionId,
    actorUserId: input.userId,
    workspaceId: input.workspaceId,
    teamId: input.teamId,
    userAgent: input.req?.userAgent,
    sourceIp: input.req?.ip,
    httpMethod: input.req?.method,
    route: input.req?.path,
    action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    result: action === "APPROVAL_REQUIRED" ? "REQUIRES_APPROVAL" : "DENIED",
    reason,
    statusCode,
    riskLevel,
    metadata: { permission: input.permission },
  });
}

export function buildAuthInputFromRequest(
  req: Request,
  workspaceId: string,
  permission: string,
  extras?: Partial<AuthorizeInput>
): AuthorizeInput {
  const clientVersionHeader = req.headers["x-workspace-security-version"];
  const clientSecurityVersion =
    typeof clientVersionHeader === "string" ? Number.parseInt(clientVersionHeader, 10) : undefined;

  return {
    userId: req.userId!,
    workspaceId,
    permission,
    clientSecurityVersion: Number.isFinite(clientSecurityVersion) ? clientSecurityVersion : undefined,
    req: {
      requestId: req.requestId,
      sessionId: req.sessionId,
      userAgent: req.userAgent,
      ip: req.ip,
      method: req.method,
      path: req.path,
    },
    ...extras,
  };
}
