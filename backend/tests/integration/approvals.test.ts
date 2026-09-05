import {
  approveRequest,
  createApprovalRequest,
  rejectRequest,
  listAllApprovals,
  listMyApprovalRequests,
  getRequestDetails,
} from "../../src/services/approvalFlows.js";
import { resolvePermission } from "../../src/services/permissionResolver.js";
import { addWorkspaceMember, createWorkspaceFixture, setRoleEffect } from "../setup/fixtures.js";

describe("approval flows", () => {
  it("PENDING → APPROVED executes permission grant path", () => {
    const { id, owner } = createWorkspaceFixture("appr_approve");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "project.create", "approval_required");

    const before = resolvePermission(member.id, id, "project.create");
    expect(before.requiresApproval).toBe(true);

    const request = createApprovalRequest(
      member.id,
      id,
      "project.create",
      "Create project",
      "Need access",
    );

    expect(request.status).toBe("pending");
    const decided = approveRequest(owner.id, request.id);
    expect(decided.status).toMatch(/approved|executed/);
  });

  it("PENDING → REJECTED blocks execution", () => {
    const { id, owner } = createWorkspaceFixture("appr_reject");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "team.create", "approval_required");

    const request = createApprovalRequest(
      member.id,
      id,
      "team.create",
      "Create team",
      "Need team access",
    );

    const decided = rejectRequest(owner.id, request.id, "Not needed");
    expect(decided.status).toBe("rejected");
  });

  it("unauthorized user cannot approve", () => {
    const { id, owner } = createWorkspaceFixture("appr_unauth");
    const member = addWorkspaceMember(id, "developer");
    const other = addWorkspaceMember(id, "viewer");
    setRoleEffect(id, "developer", "project.update", "approval_required");

    const request = createApprovalRequest(
      member.id,
      id,
      "project.update",
      "Update project",
      "Need update access",
    );

    expect(() => approveRequest(other.id, request.id)).toThrow();
    void owner;
  });

  it("lists approvals for decider and requester filters", () => {
    const { id, owner } = createWorkspaceFixture("appr_list");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "team.create", "approval_required");

    const request = createApprovalRequest(
      member.id,
      id,
      "team.create",
      "Create team",
      "Need team create access",
    );

    const pendingForOwner = listAllApprovals(owner.id, id, { status: "pending" });
    expect(pendingForOwner.some((r) => r.id === request.id)).toBe(true);

    const mine = listMyApprovalRequests(member.id, id);
    expect(mine.some((r) => r.id === request.id)).toBe(true);

    const details = getRequestDetails(request.id);
    expect(details.permission_name).toBeTruthy();
  });

  it("approve fails when requester already has permission", () => {
    const { id, owner } = createWorkspaceFixture("appr_already");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "project.view", "approval_required");

    const request = createApprovalRequest(
      member.id,
      id,
      "project.view",
      "View projects",
      "Need view",
    );

    setRoleEffect(id, "developer", "project.view", "allow");
    expect(() => approveRequest(owner.id, request.id)).toThrow("Requester already has this permission");
  });
});
