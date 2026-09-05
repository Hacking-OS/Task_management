import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { addWorkspaceMember, createWorkspaceFixture } from "../setup/fixtures.js";

describe("GET /api/security/workspaces/:id/events", () => {
  const agent = createApiAgent();

  it("returns 200 for workspace owner", async () => {
    const { id, owner } = createWorkspaceFixture("sec_owner");
    const res = await agent
      .get(`/api/security/workspaces/${id}/events`)
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it("returns 403 for non-owner member", async () => {
    const { id, owner } = createWorkspaceFixture("sec_member");
    const member = addWorkspaceMember(id, "developer");

    await agent
      .get(`/api/security/workspaces/${id}/events`)
      .set(authHeader(member.accessToken))
      .expect(403);

    // owner still has access
    await agent
      .get(`/api/security/workspaces/${id}/events`)
      .set(authHeader(owner.accessToken))
      .expect(200);
  });
});
