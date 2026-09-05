import { describe, expect, it } from "@jest/globals";
import type { Request } from "express";
import {
  authorize,
  buildAuthInputFromRequest,
  requireAuthorize,
  requireApprovalDecisionAuthority,
  ConflictError,
} from "../../../src/services/authorizationService.js";
import { PermissionDeniedError, ForbiddenError } from "../../../src/services/authorization.js";
import { createTask } from "../../../src/services/tasks.js";
import { addWorkspaceMember, createWorkspaceFixture, setRoleEffect } from "../../setup/fixtures.js";

function mockRequest(overrides: Partial<Request & { userId?: string }> = {}): Request {
  return {
    userId: overrides.userId,
    headers: overrides.headers ?? {},
    requestId: "req-test",
    sessionId: "sess-test",
    userAgent: "jest",
    ip: "127.0.0.1",
    method: "GET",
    path: "/api/test",
    ...overrides,
  } as Request;
}

describe("authorizationService", () => {
  describe("buildAuthInputFromRequest", () => {
    it("maps request fields and parses security version header", () => {
      const { id, owner } = createWorkspaceFixture("auth_in");
      const req = mockRequest({
        userId: owner.id,
        headers: { "x-workspace-security-version": "3" },
      });

      const input = buildAuthInputFromRequest(req, id, "task.view", {
        resourceType: "task",
        resourceId: "task-1",
      });

      expect(input.userId).toBe(owner.id);
      expect(input.workspaceId).toBe(id);
      expect(input.permission).toBe("task.view");
      expect(input.clientSecurityVersion).toBe(3);
      expect(input.resourceType).toBe("task");
      expect(input.req?.requestId).toBe("req-test");
    });

    it("ignores invalid security version header", () => {
      const { id, owner } = createWorkspaceFixture("auth_in_bad");
      const req = mockRequest({
        userId: owner.id,
        headers: { "x-workspace-security-version": "not-a-number" },
      });

      const input = buildAuthInputFromRequest(req, id, "workspace.view");
      expect(input.clientSecurityVersion).toBeUndefined();
    });
  });

  describe("requireAuthorize", () => {
    it("returns result when permission is allowed", () => {
      const { id, owner } = createWorkspaceFixture("auth_allow");
      const result = requireAuthorize({
        userId: owner.id,
        workspaceId: id,
        permission: "task.view",
      });
      expect(result.allowed).toBe(true);
    });

    it("throws PermissionDeniedError when denied", () => {
      const { id } = createWorkspaceFixture("auth_deny");
      const member = addWorkspaceMember(id, "viewer");
      expect(() =>
        requireAuthorize({
          userId: member.id,
          workspaceId: id,
          permission: "workspace.delete",
        }),
      ).toThrow(PermissionDeniedError);
    });

    it("throws PermissionDeniedError with requiresApproval flag", () => {
      const { id } = createWorkspaceFixture("auth_appr");
      const member = addWorkspaceMember(id, "developer");
      setRoleEffect(id, "developer", "project.create", "approval_required");

      try {
        requireAuthorize({
          userId: member.id,
          workspaceId: id,
          permission: "project.create",
        });
        throw new Error("Expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        expect((error as PermissionDeniedError).requiresApproval).toBe(true);
      }
    });
  });

  describe("authorize branches", () => {
    it("denies non-members", () => {
      const { id, owner } = createWorkspaceFixture("auth_nonmem");
      const result = authorize({
        userId: owner.id,
        workspaceId: "00000000-0000-0000-0000-000000000099",
        permission: "task.view",
      });
      expect(result.denied).toBe(true);
      expect(result.reason).toBe("Not a workspace member");
    });

    it("denies resource outside workspace scope", () => {
      const wsA = createWorkspaceFixture("auth_scope_a");
      const wsB = createWorkspaceFixture("auth_scope_b");
      const task = createTask(wsB.owner.id, { title: "Foreign", workspace_id: wsB.id });

      const result = authorize({
        userId: wsA.owner.id,
        workspaceId: wsA.id,
        permission: "task.view",
        resourceType: "task",
        resourceId: task.id,
      });
      expect(result.denied).toBe(true);
      expect(result.reason).toBe("Resource not found");
    });

    it("denies unknown team in workspace", () => {
      const { id, owner } = createWorkspaceFixture("auth_team");
      const result = authorize({
        userId: owner.id,
        workspaceId: id,
        permission: "team.view",
        teamId: "00000000-0000-0000-0000-000000000099",
      });
      expect(result.denied).toBe(true);
      expect(result.reason).toBe("Team not found");
    });
  });

  describe("requireApprovalDecisionAuthority", () => {
    it("allows workspace owner to decide approvals", () => {
      const { id, owner } = createWorkspaceFixture("auth_decide_ok");
      expect(() => requireApprovalDecisionAuthority(owner.id, id, "task.delete")).not.toThrow();
    });

    it("throws ForbiddenError for unauthorized decider", () => {
      const { id } = createWorkspaceFixture("auth_decide_no");
      const member = addWorkspaceMember(id, "viewer");
      expect(() => requireApprovalDecisionAuthority(member.id, id, "task.delete")).toThrow(
        ForbiddenError,
      );
    });
  });

  describe("ConflictError", () => {
    it("exposes 409 status", () => {
      const err = new ConflictError("Duplicate");
      expect(err.status).toBe(409);
      expect(err.message).toBe("Duplicate");
    });
  });
});
