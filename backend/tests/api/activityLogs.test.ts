import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture } from "../setup/fixtures.js";

describe("GET /api/activity-logs", () => {
  const agent = createApiAgent();

  it("returns activity logs for workspace", async () => {
    const { id, owner } = createWorkspaceFixture("act_logs");
    const res = await agent
      .get("/api/activity-logs")
      .query({ workspace_id: id })
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs.some((l: { action: string }) => l.action === "created")).toBe(true);
  });
});
