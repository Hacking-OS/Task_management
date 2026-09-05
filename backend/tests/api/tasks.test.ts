import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, type TestUser, type WorkspaceFixture } from "../setup/fixtures.js";

describe("task API", () => {
  const agent = createApiAgent();
  let fixture: WorkspaceFixture;

  beforeEach(() => {
    fixture = createWorkspaceFixture("tasks");
  });

  async function createTask(owner: TestUser, workspaceId: string, title = "Test Task") {
    const res = await agent
      .post("/api/tasks")
      .set(authHeader(owner.accessToken))
      .send({ workspace_id: workspaceId, title, description: "Task description" })
      .expect(201);
    return res.body.task as { id: string; title: string; workspace_id: string };
  }

  it("owner can list tasks by workspace_id", async () => {
    const task = await createTask(fixture.owner, fixture.id);

    const res = await agent
      .get("/api/tasks")
      .query({ workspace_id: fixture.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks.some((t: { id: string }) => t.id === task.id)).toBe(true);
  });

  it("owner can get task by id", async () => {
    const task = await createTask(fixture.owner, fixture.id, "Get Me");

    const res = await agent
      .get(`/api/tasks/${task.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(res.body.task.id).toBe(task.id);
    expect(res.body.task.title).toBe("Get Me");
  });

  it("owner can get task activity", async () => {
    const task = await createTask(fixture.owner, fixture.id, "Activity Task");

    const res = await agent
      .get(`/api/tasks/${task.id}/activity`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });

  it("owner can create a task", async () => {
    const res = await agent
      .post("/api/tasks")
      .set(authHeader(fixture.owner.accessToken))
      .send({
        workspace_id: fixture.id,
        title: "New Task",
        description: "Created via API",
        priority: "high",
        severity: "high",
      })
      .expect(201);

    expect(res.body.task.title).toBe("New Task");
    expect(res.body.task.workspace_id).toBe(fixture.id);
  });

  it("owner can patch update a task", async () => {
    const task = await createTask(fixture.owner, fixture.id, "Before Update");

    const res = await agent
      .patch(`/api/tasks/${task.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "After Update", priority: "low" })
      .expect(200);

    expect(res.body.task.title).toBe("After Update");
    expect(res.body.task.priority).toBe("low");
  });

  it("owner can delete a task", async () => {
    const task = await createTask(fixture.owner, fixture.id, "Delete Me");

    await agent
      .delete(`/api/tasks/${task.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(204);

    await agent
      .get(`/api/tasks/${task.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });

  it("rejects unauthenticated requests", async () => {
    await agent.get("/api/tasks").query({ workspace_id: fixture.id }).expect(401);
    await agent.post("/api/tasks").send({ workspace_id: fixture.id, title: "X" }).expect(401);
  });

  it("non-member cannot list tasks in another workspace", async () => {
    const other = createWorkspaceFixture("tasks_other");

    await agent
      .get("/api/tasks")
      .query({ workspace_id: other.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("non-member cannot access another workspace task", async () => {
    const other = createWorkspaceFixture("tasks_foreign");
    const foreignTask = await createTask(other.owner, other.id, "Foreign Task");

    await agent
      .get(`/api/tasks/${foreignTask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);

    await agent
      .patch(`/api/tasks/${foreignTask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "Hijacked" })
      .expect(403);

    await agent
      .delete(`/api/tasks/${foreignTask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("returns 404 for missing task", async () => {
    const missingId = "00000000-0000-0000-0000-000000000099";

    await agent
      .get(`/api/tasks/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);

    await agent
      .get(`/api/tasks/${missingId}/activity`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);

    await agent
      .patch(`/api/tasks/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "Nope" })
      .expect(404);

    await agent
      .delete(`/api/tasks/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });
});
