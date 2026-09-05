import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, type TestUser, type WorkspaceFixture } from "../setup/fixtures.js";

describe("subtask API", () => {
  const agent = createApiAgent();
  let fixture: WorkspaceFixture;

  beforeEach(() => {
    fixture = createWorkspaceFixture("subtasks");
  });

  async function createTask(owner: TestUser, workspaceId: string, title = "Parent Task") {
    const res = await agent
      .post("/api/tasks")
      .set(authHeader(owner.accessToken))
      .send({ workspace_id: workspaceId, title })
      .expect(201);
    return res.body.task as { id: string; title: string };
  }

  async function createSubtask(
    owner: TestUser,
    workspaceId: string,
    taskId: string,
    title = "Test Subtask",
  ) {
    const res = await agent
      .post("/api/subtasks")
      .set(authHeader(owner.accessToken))
      .send({ workspace_id: workspaceId, task_id: taskId, title })
      .expect(201);
    return res.body.subtask as { id: string; title: string; task_id: string; workspace_id: string };
  }

  it("owner can list subtasks by workspace_id and task_id", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const subtask = await createSubtask(fixture.owner, fixture.id, task.id);

    const res = await agent
      .get("/api/subtasks")
      .query({ workspace_id: fixture.id, task_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.subtasks)).toBe(true);
    expect(res.body.subtasks.some((s: { id: string }) => s.id === subtask.id)).toBe(true);
  });

  it("owner can create a subtask linked to a task", async () => {
    const task = await createTask(fixture.owner, fixture.id);

    const res = await agent
      .post("/api/subtasks")
      .set(authHeader(fixture.owner.accessToken))
      .send({ workspace_id: fixture.id, task_id: task.id, title: "New Subtask", severity: "high" })
      .expect(201);

    expect(res.body.subtask.title).toBe("New Subtask");
    expect(res.body.subtask.task_id).toBe(task.id);
    expect(res.body.subtask.workspace_id).toBe(fixture.id);
  });

  it("owner can patch update a subtask", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const subtask = await createSubtask(fixture.owner, fixture.id, task.id, "Before Update");

    const res = await agent
      .patch(`/api/subtasks/${subtask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "After Update", severity: "low" })
      .expect(200);

    expect(res.body.subtask.title).toBe("After Update");
    expect(res.body.subtask.severity).toBe("low");
  });

  it("owner can delete a subtask", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const subtask = await createSubtask(fixture.owner, fixture.id, task.id, "Delete Me");

    await agent
      .delete(`/api/subtasks/${subtask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(204);

    const list = await agent
      .get("/api/subtasks")
      .query({ workspace_id: fixture.id, task_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(list.body.subtasks.some((s: { id: string }) => s.id === subtask.id)).toBe(false);
  });

  it("rejects unauthenticated requests", async () => {
    await agent.get("/api/subtasks").query({ workspace_id: fixture.id }).expect(401);
    await agent
      .post("/api/subtasks")
      .send({ workspace_id: fixture.id, task_id: "x", title: "X" })
      .expect(401);
  });

  it("non-member cannot list subtasks in another workspace", async () => {
    const other = createWorkspaceFixture("subtasks_other");

    await agent
      .get("/api/subtasks")
      .query({ workspace_id: other.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("non-member cannot modify another workspace subtask", async () => {
    const other = createWorkspaceFixture("subtasks_foreign");
    const foreignTask = await createTask(other.owner, other.id);
    const foreignSubtask = await createSubtask(other.owner, other.id, foreignTask.id, "Foreign Subtask");

    await agent
      .patch(`/api/subtasks/${foreignSubtask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "Hijacked" })
      .expect(403);

    await agent
      .delete(`/api/subtasks/${foreignSubtask.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("returns 404 for missing subtask", async () => {
    const missingId = "00000000-0000-0000-0000-000000000099";

    await agent
      .patch(`/api/subtasks/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ title: "Nope" })
      .expect(404);

    await agent
      .delete(`/api/subtasks/${missingId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });
});
