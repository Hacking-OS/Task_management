import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, uniqueId } from "../setup/fixtures.js";

describe("workspace API", () => {
  const agent = createApiAgent();

  it("authenticated user can list workspaces", async () => {
    const { owner } = createWorkspaceFixture("ws_list");
    const res = await agent.get("/api/workspaces").set(authHeader(owner.accessToken!)).expect(200);
    expect(Array.isArray(res.body.workspaces)).toBe(true);
    expect(res.body.workspaces.length).toBeGreaterThan(0);
  });

  it("unauthenticated request rejected", async () => {
    await agent.get("/api/workspaces").expect(401);
  });

  it("user cannot access another workspace's resources", async () => {
    const wsA = createWorkspaceFixture("ws_a");
    const wsB = createWorkspaceFixture("ws_b");

    await agent
      .get(`/api/workspaces/${wsB.id}`)
      .set(authHeader(wsA.owner.accessToken!))
      .expect(403);
  });

  it("owner can create workspace via API", async () => {
    const id = uniqueId("ws_create");
    const reg = await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" });
    const token = reg.body.accessToken as string;

    const res = await agent
      .post("/api/workspaces")
      .set(authHeader(token))
      .send({ name: "New Workspace", description: "Created in test" })
      .expect(201);

    expect(res.body.workspace.name).toBe("New Workspace");
    expect(res.body.workspace.passwordHash).toBeUndefined();
  });
});
