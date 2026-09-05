import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture } from "../setup/fixtures.js";

describe("stats API", () => {
  const agent = createApiAgent();

  it("GET /api/stats/severity returns severity counts for workspace", async () => {
    const { id, owner } = createWorkspaceFixture("stats_sev");
    const res = await agent
      .get("/api/stats/severity")
      .query({ workspace_id: id })
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.tasks).toBeDefined();
    expect(res.body.stats.issues).toBeDefined();
    expect(res.body.stats.subtasks).toBeDefined();
  });

  it("GET /api/stats/dashboard returns dashboard stats for workspace", async () => {
    const { id, owner } = createWorkspaceFixture("stats_dash");
    const res = await agent
      .get("/api/stats/dashboard")
      .query({ workspace_id: id })
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totals).toBeDefined();
    expect(res.body.stats.byStatus).toBeDefined();
    expect(res.body.stats.completion).toBeDefined();
    expect(res.body.stats.severity).toBeDefined();
  });
});
