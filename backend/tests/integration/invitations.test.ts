import { db } from "../../src/db.js";
import {
  createInvitation,
  acceptInvitation,
  resendInvitation,
  removeMember,
  listMembers,
} from "../../src/services/workspaceMembers.js";
import { getMembership } from "../../src/services/authorization.js";
import { getRoleBySlug } from "../../src/services/workspaceRoles.js";
import { addWorkspaceMember, createWorkspaceFixture, createTestUser } from "../setup/fixtures.js";

describe("invitation service", () => {
  it("creates valid pending invitation", () => {
    const { id, owner } = createWorkspaceFixture("inv_create");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "newmember@test.local", role.id);
    expect(invite.status).toBe("pending");
    expect(invite.token).toBeTruthy();
  });

  it("rejects duplicate pending invite for same email", () => {
    const { id, owner } = createWorkspaceFixture("inv_dup");
    const role = getRoleBySlug(id, "developer")!;
    createInvitation(owner.id, id, "dup@test.local", role.id);
    expect(() => createInvitation(owner.id, id, "dup@test.local", role.id)).toThrow();
  });

  it("acceptance creates membership once", () => {
    const { id, owner } = createWorkspaceFixture("inv_accept");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "acceptme@test.local", role.id);
    const user = createTestUser("invitee");
    // Override email to match invitation
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("acceptme@test.local", user.id);

    acceptInvitation(user.id, invite.token);
    expect(getMembership(user.id, id)).toBeDefined();
    expect(() => acceptInvitation(user.id, invite.token)).toThrow();
  });

  it("wrong user cannot accept invitation for another email", () => {
    const { id, owner } = createWorkspaceFixture("inv_wrong");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "target@test.local", role.id);
    const other = createTestUser("other");
    expect(() => acceptInvitation(other.id, invite.token)).toThrow();
  });

  it("resendInvitation refreshes token and expiry for pending invite", () => {
    const { id, owner } = createWorkspaceFixture("inv_resend");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "resend@test.local", role.id);
    const resent = resendInvitation(owner.id, id, invite.id);

    expect(resent.status).toBe("pending");
    expect(resent.token).not.toBe(invite.token);
    expect(resent.invite_code).not.toBe(invite.invite_code);
    expect(new Date(resent.expires_at).getTime()).toBeGreaterThanOrEqual(new Date(invite.expires_at).getTime());
  });

  it("resendInvitation rejects non-pending invitations", () => {
    const { id, owner } = createWorkspaceFixture("inv_resend_bad");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "revoked@test.local", role.id);
    db.prepare("UPDATE workspace_invitations SET status = 'revoked' WHERE id = ?").run(invite.id);
    expect(() => resendInvitation(owner.id, id, invite.id)).toThrow("Only pending invitations can be resent");
  });

  it("removeMember removes non-owner member", () => {
    const { id, owner } = createWorkspaceFixture("inv_remove");
    const member = addWorkspaceMember(id, "developer");
    const memberRow = listMembers(id).find((m) => m.user_id === member.id)!;

    removeMember(id, memberRow.id, owner.id);
    expect(getMembership(member.id, id)).toBeUndefined();
  });

  it("removeMember rejects removing owner or self", () => {
    const { id, owner } = createWorkspaceFixture("inv_remove_bad");
    const member = addWorkspaceMember(id, "developer");
    const ownerRow = listMembers(id).find((m) => m.user_id === owner.id)!;
    const memberRow = listMembers(id).find((m) => m.user_id === member.id)!;

    expect(() => removeMember(id, ownerRow.id, owner.id)).toThrow("Cannot remove the workspace owner");
    expect(() => removeMember(id, memberRow.id, member.id)).toThrow("Cannot remove yourself");
  });
});
