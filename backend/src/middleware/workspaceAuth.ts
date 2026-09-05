import { Response, NextFunction, Request } from "express";
import { db } from "../db.js";
import { ForbiddenError, PermissionDeniedError, requireMembership, getEffectivePermissions, isWorkspaceOwner } from "../services/authorization.js";
import { isApprovalFlowsEnabled } from "../services/approvalFlows.js";
import { buildAuthInputFromRequest, requireAuthorize, ConflictError } from "../services/authorizationService.js";
import { paramString } from "../utils/params.js";
import { getMemberSecurityVersion } from "../services/securityVersion.js";

export function handleServiceError(res: Response, error: unknown, req?: Request): void {
  if (res.headersSent) return;
  const requestId = req?.requestId;

  if (error instanceof ConflictError) {
    res.status(409).json({ error: error.message, requestId });
    return;
  }

  if (error instanceof ForbiddenError) {
    if (error instanceof PermissionDeniedError) {
      const approvalAvailable =
        !!error.workspaceId &&
        isApprovalFlowsEnabled(error.workspaceId) &&
        error.requiresApproval;
      const securityVersion = error.workspaceId && req?.userId
        ? getMemberSecurityVersion(error.workspaceId, req.userId)
        : undefined;
      res.status(403).json({
        error: error.message,
        permission: error.permission,
        approval_available: approvalAvailable,
        requires_approval: error.requiresApproval,
        security_version: securityVersion,
        requestId,
      });
      return;
    }
    res.status(403).json({ error: error.message, requestId });
    return;
  }
  const message = error instanceof Error ? error.message : "Request failed";
  const status = message.includes("not found") ? 404 : 400;
  res.status(status).json({ error: message, requestId });
}

function runPermCheck(req: Request, res: Response, next: NextFunction, workspaceId: string | undefined, permission: string): void {
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required", requestId: req.requestId });
    return;
  }
  try {
    requireAuthorize(buildAuthInputFromRequest(req, workspaceId, permission));
    next();
  } catch (error) {
    handleServiceError(res, error, req);
  }
}

/** Require permission when workspace id is in route params (e.g. :id or :workspaceId). */
export function requirePermFromParam(param: string, permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    runPermCheck(req, res, next, paramString(req.params[param]), permission);
  };
}

/** Require permission when workspace id is in query string. Skips if query param absent. */
export function requirePermFromQuery(field: string, permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.query[field];
    const workspaceId = typeof value === "string" ? value : undefined;
    if (!workspaceId) {
      next();
      return;
    }
    runPermCheck(req, res, next, workspaceId, permission);
  };
}

/** Require permission using workspace id from request body. */
export function requirePermFromBody(field: string, permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const workspaceId = req.body?.[field] as string | undefined;
    if (!workspaceId) {
      res.status(400).json({ error: `${field} is required` });
      return;
    }
    runPermCheck(req, res, next, workspaceId, permission);
  };
}

/** Require workspace membership from route param. */
export function requireMembershipFromParam(param: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      requireMembership(req.userId!, paramString(req.params[param]));
      next();
    } catch (error) {
      handleServiceError(res, error, req);
    }
  };
}

type EntityTable = "tasks" | "issues" | "subtasks";

/** Resolve workspace from entity id and enforce permission (for /:id routes). */
export function requireEntityPerm(table: EntityTable, permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const id = paramString(req.params.id);
      const row = db.prepare(`SELECT workspace_id FROM ${table} WHERE id = ?`).get(id) as { workspace_id: string | null } | undefined;
      if (!row?.workspace_id) {
        res.status(404).json({ error: "Not found", requestId: req.requestId });
        return;
      }
      const resourceType = table === "tasks" ? "task" : table === "issues" ? "issue" : "subtask";
      requireAuthorize(
        buildAuthInputFromRequest(req, row.workspace_id, permission, {
          resourceType,
          resourceId: id,
        })
      );
      next();
    } catch (error) {
      handleServiceError(res, error, req);
    }
  };
}

export function requireWorkspacePerm(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    runPermCheck(req, res, next, paramString(req.params.workspaceId), permission);
  };
}

export function requireWorkspaceOwner() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const workspaceId = paramString(req.params.workspaceId);
      if (!req.userId || !isWorkspaceOwner(req.userId, workspaceId)) {
        throw new ForbiddenError("Only the workspace owner can manage permissions");
      }
      next();
    } catch (error) {
      handleServiceError(res, error, req);
    }
  };
}

export function attachPermissions(req: Request, _res: Response, next: NextFunction): void {
  const workspaceId = paramString(req.params.workspaceId);
  if (req.userId && workspaceId) {
    (req as Request & { permissions?: string[] }).permissions = getEffectivePermissions(req.userId, workspaceId);
  }
  next();
}
