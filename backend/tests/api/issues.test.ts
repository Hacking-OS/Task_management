import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, type TestUser, type WorkspaceFixture } from "../setup/fixtures.js";

describe("issue API", () => {
  const agent = createApiAgent();
  let fixture: WorkspaceFixture;

  beforeEach(() => {
    fixture = createWorkspaceFixture("issues");
  });

  async function createIssue(owner: TestUser, workspaceId: string, title = "Test Issue") {
    const res = await agent
      .post("/api/issues")
      .set(authHeader(owner.accessToken))
      .send({ workspace_id: workspaceId, title, description: "Issue description" })
      .expect(201);
    return res.body.issue as { id: string; title: string; workspace_id: string };
  }

  it("owner can list issues by workspace_id", async () => {
    const issue = await createIssue(fixture.owner, fixture.id);

    const res = await agent
      .get("/api/issues")
      .query({ workspace_id: fixture.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.some((i: { id: string }) => i.id === issue.id)).toBe(true);
  });

  it("owner can get issue by id", async () => {
    const issue = await createIssue(fixture.owner, fixture.id, "Get Me");

    const res = await agent
      .get(`/api/issues/${issue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(res.body.issue.id).toBe(issue.id);
    expect(res.body.issue.title).toBe("Get Me");
  });

  it("owner can get issue activity", async () => {
    const issue = await createIssue(fixture.owner, fixture.id, "Activity Issue");

    const res = await agent
      .get(`/api/issues/${issue.id}/activity`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });

  it("owner can create an issue", async () => {
    const res = await agent
      .post("/api/issues")
      .set(authHeader(fixture.owner.accessToken))
      .send({
        workspace_id: fixture.id,
        title: "New Issue",
        description: "Created via API",
        priority: "medium",
        severity: "critical",
      })
      .expect(201);

    expect(res.body.issue.title).toBe("New Issue");
    expect(res.body.issue.workspace_id).toBe(fixture.id);
  });

  it("owner can patch update an issue", async () => {
    const issue = await createIssue(fixture.owner, fixture.id, "Before Update");

    const res = await agent
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "After Update", severity: "low" })
      .expect(200);

    expect(res.body.issue.title).toBe("After Update");
    expect(res.body.issue.severity).toBe("low");
  });

  it("owner can delete an issue", async () => {
    const issue = await createIssue(fixture.owner, fixture.id, "Delete Me");

    await agent
      .delete(`/api/issues/${issue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(204);

    await agent
      .get(`/api/issues/${issue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });

  it("rejects unauthenticated requests", async () => {
    await agent.get("/api/issues").query({ workspace_id: fixture.id }).expect(401);
    await agent.post("/api/issues").send({ workspace_id: fixture.id, title: "X" }).expect(401);
  });

  it("non-member cannot list issues in another workspace", async () => {
    const other = createWorkspaceFixture("issues_other");

    await agent
      .get("/api/issues")
      .query({ workspace_id: other.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("non-member cannot access another workspace issue", async () => {
    const other = createWorkspaceFixture("issues_foreign");
    const foreignIssue = await createIssue(other.owner, other.id, "Foreign Issue");

    await agent
      .get(`/api/issues/${foreignIssue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);

    await agent
      .patch(`/api/issues/${foreignIssue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "Hijacked" })
      .expect(403);

    await agent
      .delete(`/api/issues/${foreignIssue.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("returns 404 for missing issue", async () => {
    const missingId = "00000000-0000-0000-0000-000000000099";

    await agent
      .get(`/api/issues/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);

    await agent
      .get(`/api/issues/${missingId}/activity`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);

    await agent
      .patch(`/api/issues/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "Nope" })
      .expect(404);

    await agent
      .delete(`/api/issues/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });
});
