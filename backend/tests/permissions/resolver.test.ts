import { resolvePermission } from "../../src/services/permissionResolver.js";
import {
  addWorkspaceMember,
  createTestUser,
  createWorkspaceFixture,
  grantMemberOverride,
  setRoleEffect,
} from "../setup/fixtures.js";

describe("permission resolver", () => {
  it("owner always allowed", () => {
    const { id, owner } = createWorkspaceFixture("perm_owner");
    const result = resolvePermission(owner.id, id, "workspace.delete");
    expect(result.allowed).toBe(true);
    expect(result.denied).toBe(false);
  });

  it("role ALLOW grants permission", () => {
    const { id, owner } = createWorkspaceFixture("perm_allow");
    const admin = addWorkspaceMember(id, "admin");
    setRoleEffect(id, "admin", "project.create", "allow");
    const result = resolvePermission(admin.id, id, "project.create");
    expect(result.allowed).toBe(true);
    expect(result.reason).toMatch(/role/i);
  });

  it("role APPROVAL_REQUIRED requires approval path", () => {
    const { id, owner } = createWorkspaceFixture("perm_approval");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "project.delete", "approval_required");
    const result = resolvePermission(member.id, id, "project.delete");
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.canRequestApproval).toBe(true);
  });

  it("role DENY blocks permission", () => {
    const { id, owner } = createWorkspaceFixture("perm_deny");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "project.delete", "deny");
    const result = resolvePermission(member.id, id, "project.delete");
    expect(result.denied).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it("user DENY override beats role ALLOW", () => {
    const { id, owner } = createWorkspaceFixture("perm_override_deny");
    const admin = addWorkspaceMember(id, "admin");
    setRoleEffect(id, "admin", "project.update", "allow");
    grantMemberOverride(id, admin.id, [], ["project.update"]);
    const result = resolvePermission(admin.id, id, "project.update");
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/denied for user/i);
  });

  it("user ALLOW override beats role DENY", () => {
    const { id, owner } = createWorkspaceFixture("perm_override_allow");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "team.create", "deny");
    grantMemberOverride(id, member.id, ["team.create"], []);
    const result = resolvePermission(member.id, id, "team.create");
    expect(result.allowed).toBe(true);
    expect(result.reason).toMatch(/override/i);
  });

  it("non-member denied", () => {
    const { id, owner } = createWorkspaceFixture("perm_nonmember");
    const outsider = createTestUser("outsider");
    const { id: otherWs } = createWorkspaceFixture("perm_other");
    const result = resolvePermission(outsider.id, otherWs, "workspace.view");
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/not a workspace member/i);
  });

  it("unknown permission code denied", () => {
    const { id, owner } = createWorkspaceFixture("perm_unknown");
    const result = resolvePermission(owner.id, id, "fake.permission");
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/unknown permission/i);
  });
});
