import { Response, NextFunction, Request } from "express";
import { db } from "../db.js";
import { ForbiddenError, requirePermission, requireMembership, getEffectivePermissions, isWorkspaceOwner } from "../services/authorization.js";
import { paramString } from "../utils/params.js";

export function handleServiceError(res: Response, error: unknown): void {
  if (res.headersSent) return;
  if (error instanceof ForbiddenError) {
    res.status(403).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Request failed";
  const status = message.includes("not found") ? 404 : 400;
  res.status(status).json({ error: message });
}

function runPermCheck(req: Request, res: Response, next: NextFunction, workspaceId: string | undefined, permission: string): void {
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }
  try {
    requirePermission(req.userId!, workspaceId, permission);
    next();
  } catch (error) {
    handleServiceError(res, error);
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
      handleServiceError(res, error);
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
        res.status(404).json({ error: "Not found" });
        return;
      }
      requirePermission(req.userId!, row.workspace_id, permission);
      next();
    } catch (error) {
      handleServiceError(res, error);
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
      handleServiceError(res, error);
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
