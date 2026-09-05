import { describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import {
  attachPermissions,
  handleServiceError,
  requireEntityPerm,
  requireMembershipFromParam,
  requirePermFromBody,
  requirePermFromParam,
  requirePermFromQuery,
  requireWorkspaceOwner,
  requireWorkspacePerm,
} from "../../../src/middleware/workspaceAuth.js";
import { ForbiddenError, PermissionDeniedError } from "../../../src/services/authorization.js";
import { ConflictError } from "../../../src/services/authorizationService.js";
import { createIssueInWorkspace } from "../../../src/services/issues.js";
import { createSubtaskInWorkspace } from "../../../src/services/subtasks.js";
import { createTaskInWorkspace } from "../../../src/services/tasks.js";
import {
  addWorkspaceMember,
  createTestUser,
  createWorkspaceFixture,
  setRoleEffect,
} from "../../setup/fixtures.js";

function mockReqRes(overrides: Partial<Request> & { body?: Record<string, unknown> } = {}) {
  const req = {
    headers: {},
    method: "GET",
    path: "/test",
    ip: "127.0.0.1",
    requestId: "req-ws",
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    headersSent: false,
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("middleware/workspaceAuth", () => {
  describe("handleServiceError", () => {
    it("returns 409 for ConflictError", () => {
      const { req, res } = mockReqRes();
      handleServiceError(res, new ConflictError("Resource conflict"), req);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: "Resource conflict", requestId: "req-ws" });
    });

    it("returns 403 with approval metadata for PermissionDeniedError", () => {
      const { id, owner } = createWorkspaceFixture("ws_perm_denied");
      const { req, res } = mockReqRes({ userId: owner.id });
      const error = new PermissionDeniedError("task.delete", id, true);
      handleServiceError(res, error, req);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Approval required"),
          permission: "task.delete",
          requires_approval: true,
          approval_available: true,
          security_version: expect.any(Number),
          requestId: "req-ws",
        }),
      );
    });

    it("omits security_version when workspace id is absent", () => {
      const { req, res } = mockReqRes({ userId: "user-1" });
      const error = new PermissionDeniedError("task.delete", null, false);
      handleServiceError(res, error, req);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: "task.delete",
          security_version: undefined,
          approval_available: false,
        }),
      );
    });

    it("returns 403 for generic ForbiddenError", () => {
      const { req, res } = mockReqRes();
      handleServiceError(res, new ForbiddenError("Not allowed"), req);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Not allowed", requestId: "req-ws" });
    });

    it("returns 404 when error message includes not found", () => {
      const { req, res } = mockReqRes();
      handleServiceError(res, new Error("Task not found"), req);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Task not found", requestId: "req-ws" });
    });

    it("returns 400 for other errors", () => {
      const { req, res } = mockReqRes();
      handleServiceError(res, new Error("Bad input"), req);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Bad input", requestId: "req-ws" });
    });

    it("returns 400 for non-Error values", () => {
      const { req, res } = mockReqRes();
      handleServiceError(res, "failure", req);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Request failed", requestId: "req-ws" });
    });

    it("does nothing when headers already sent", () => {
      const { req, res } = mockReqRes();
      (res as { headersSent: boolean }).headersSent = true;
      handleServiceError(res, new ConflictError("late"), req);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("requirePermFromParam", () => {
    it("returns 400 when workspace param is missing", () => {
      const { id, owner } = createWorkspaceFixture("ws_param_missing");
      const middleware = requirePermFromParam("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: {} });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("allows owner with permission", () => {
      const { id, owner } = createWorkspaceFixture("ws_param_ok");
      const middleware = requirePermFromParam("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("denies outsider without permission", () => {
      const { id } = createWorkspaceFixture("ws_param_deny");
      const outsider = createTestUser("ws_outsider");
      const middleware = requirePermFromParam("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: outsider.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requirePermFromQuery", () => {
    it("skips check when query param is absent", () => {
      const middleware = requirePermFromQuery("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: "any" });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("checks permission when query param is present", () => {
      const { id, owner } = createWorkspaceFixture("ws_query_ok");
      const middleware = requirePermFromQuery("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, query: { workspaceId: id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("denies when query workspace id lacks permission", () => {
      const { id } = createWorkspaceFixture("ws_query_deny");
      const outsider = createTestUser("ws_query_out");
      const middleware = requirePermFromQuery("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: outsider.id, query: { workspaceId: id } });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requirePermFromBody", () => {
    it("returns 400 when body field is missing", () => {
      const middleware = requirePermFromBody("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: "any", body: {} });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "workspaceId is required" });
    });

    it("allows owner when body contains workspace id", () => {
      const { id, owner } = createWorkspaceFixture("ws_body_ok");
      const middleware = requirePermFromBody("workspaceId", "workspace.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, body: { workspaceId: id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("requireMembershipFromParam", () => {
    it("allows workspace member", () => {
      const { id, owner } = createWorkspaceFixture("ws_member_ok");
      const middleware = requireMembershipFromParam("workspaceId");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("denies non-member", () => {
      const { id } = createWorkspaceFixture("ws_member_deny");
      const outsider = createTestUser("ws_member_out");
      const middleware = requireMembershipFromParam("workspaceId");
      const { req, res, next } = mockReqRes({ userId: outsider.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireEntityPerm", () => {
    it("returns 404 when entity does not exist", () => {
      const { owner } = createWorkspaceFixture("ws_entity_missing");
      const middleware = requireEntityPerm("tasks", "task.view");
      const { req, res, next } = mockReqRes({
        userId: owner.id,
        params: { id: "00000000-0000-0000-0000-000000000099" },
      });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("allows authorized access to task", () => {
      const { id, owner } = createWorkspaceFixture("ws_entity_task");
      const task = createTaskInWorkspace(owner.id, id, { title: "Entity perm task" });
      const middleware = requireEntityPerm("tasks", "task.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { id: task.id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("allows authorized access to issue", () => {
      const { id, owner } = createWorkspaceFixture("ws_entity_issue");
      const issue = createIssueInWorkspace(owner.id, id, { title: "Entity perm issue" });
      const middleware = requireEntityPerm("issues", "issue.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { id: issue.id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("allows authorized access to subtask", () => {
      const { id, owner } = createWorkspaceFixture("ws_entity_sub");
      const task = createTaskInWorkspace(owner.id, id, { title: "Parent task" });
      const subtask = createSubtaskInWorkspace(owner.id, id, { title: "Sub entity", task_id: task.id });
      const middleware = requireEntityPerm("subtasks", "subtask.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { id: subtask.id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("denies viewer without delete permission", () => {
      const { id, owner } = createWorkspaceFixture("ws_entity_deny");
      const viewer = addWorkspaceMember(id, "viewer");
      const task = createTaskInWorkspace(owner.id, id, { title: "Protected task" });
      const middleware = requireEntityPerm("tasks", "task.delete");
      const { req, res, next } = mockReqRes({ userId: viewer.id, params: { id: task.id } });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireWorkspacePerm", () => {
    it("allows owner for workspace permission", () => {
      const { id, owner } = createWorkspaceFixture("ws_perm_route");
      const middleware = requireWorkspacePerm("workspace.view");
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("denies member without permission", () => {
      const { id, owner } = createWorkspaceFixture("ws_perm_route_deny");
      const member = addWorkspaceMember(id, "developer");
      setRoleEffect(id, "developer", "workspace.delete", "deny");
      const middleware = requireWorkspacePerm("workspace.delete");
      const { req, res, next } = mockReqRes({ userId: member.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireWorkspaceOwner", () => {
    it("allows workspace owner", () => {
      const { id, owner } = createWorkspaceFixture("ws_owner_ok");
      const middleware = requireWorkspaceOwner();
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("denies non-owner member", () => {
      const { id } = createWorkspaceFixture("ws_owner_deny");
      const admin = addWorkspaceMember(id, "admin");
      const middleware = requireWorkspaceOwner();
      const { req, res, next } = mockReqRes({ userId: admin.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Only the workspace owner can manage permissions" }),
      );
    });
  });

  describe("attachPermissions", () => {
    it("attaches effective permissions for workspace member", () => {
      const { id, owner } = createWorkspaceFixture("ws_attach");
      const middleware = attachPermissions;
      const { req, res, next } = mockReqRes({ userId: owner.id, params: { workspaceId: id } });
      middleware(req, res, next);
      expect((req as Request & { permissions?: string[] }).permissions).toEqual(
        expect.arrayContaining(["workspace.view"]),
      );
      expect(next).toHaveBeenCalled();
    });

    it("skips permissions when user or workspace id missing", () => {
      const { req, res, next } = mockReqRes({ params: {} });
      attachPermissions(req, res, next);
      expect((req as Request & { permissions?: string[] }).permissions).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});
