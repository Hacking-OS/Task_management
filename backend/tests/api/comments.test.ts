import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, type TestUser, type WorkspaceFixture } from "../setup/fixtures.js";

describe("comment API", () => {
  const agent = createApiAgent();
  let fixture: WorkspaceFixture;

  beforeEach(() => {
    fixture = createWorkspaceFixture("comments");
  });

  async function createTask(owner: TestUser, workspaceId: string, title = "Comment Target") {
    const res = await agent
      .post("/api/tasks")
      .set(authHeader(owner.accessToken))
      .send({ workspace_id: workspaceId, title })
      .expect(201);
    return res.body.task as { id: string; title: string };
  }

  async function createComment(
    owner: TestUser,
    workspaceId: string,
    entityType: string,
    entityId: string,
    body = "Test comment body",
  ) {
    const res = await agent
      .post("/api/comments")
      .set(authHeader(owner.accessToken))
      .send({ workspace_id: workspaceId, entity_type: entityType, entity_id: entityId, body })
      .expect(201);
    return res.body.comment as { id: string; body: string; entity_type: string; entity_id: string };
  }

  it("owner can list comments for a task", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const comment = await createComment(fixture.owner, fixture.id, "task", task.id, "Hello task");

    const res = await agent
      .get("/api/comments")
      .query({ entity_type: "task", entity_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(Array.isArray(res.body.comments)).toBe(true);
    expect(res.body.comments.some((c: { id: string }) => c.id === comment.id)).toBe(true);
  });

  it("owner can create a comment on a task", async () => {
    const task = await createTask(fixture.owner, fixture.id);

    const res = await agent
      .post("/api/comments")
      .set(authHeader(fixture.owner.accessToken))
      .send({
        workspace_id: fixture.id,
        entity_type: "task",
        entity_id: task.id,
        body: "A new comment on the task",
      })
      .expect(201);

    expect(res.body.comment.body).toBe("A new comment on the task");
    expect(res.body.comment.entity_type).toBe("task");
    expect(res.body.comment.entity_id).toBe(task.id);
  });

  it("owner can delete a comment", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const comment = await createComment(fixture.owner, fixture.id, "task", task.id, "Delete me");

    await agent
      .delete(`/api/comments/${comment.id}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(204);

    const list = await agent
      .get("/api/comments")
      .query({ entity_type: "task", entity_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);

    expect(list.body.comments.some((c: { id: string }) => c.id === comment.id)).toBe(false);
  });

  it("returns 400 when entity_type or entity_id is missing", async () => {
    const task = await createTask(fixture.owner, fixture.id);

    await agent
      .get("/api/comments")
      .query({ entity_type: "task" })
      .set(authHeader(fixture.owner.accessToken))
      .expect(400);

    await agent
      .get("/api/comments")
      .query({ entity_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(400);

    await agent.get("/api/comments").set(authHeader(fixture.owner.accessToken)).expect(400);
  });

  it("rejects unauthenticated requests", async () => {
    await agent.get("/api/comments").query({ entity_type: "task", entity_id: "x" }).expect(401);
    await agent
      .post("/api/comments")
      .send({ workspace_id: fixture.id, entity_type: "task", entity_id: "x", body: "Hi" })
      .expect(401);
  });

  it("non-member cannot list comments on another workspace entity", async () => {
    const other = createWorkspaceFixture("comments_other");
    const foreignTask = await createTask(other.owner, other.id);

    await agent
      .get("/api/comments")
      .query({ entity_type: "task", entity_id: foreignTask.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(403);
  });

  it("non-member cannot create comment in another workspace", async () => {
    const other = createWorkspaceFixture("comments_foreign");
    const foreignTask = await createTask(other.owner, other.id);

    await agent
      .post("/api/comments")
      .set(authHeader(fixture.owner.accessToken))
      .send({
        workspace_id: other.id,
        entity_type: "task",
        entity_id: foreignTask.id,
        body: "Intruder comment",
      })
      .expect(403);
  });

  it("returns 404 when deleting missing comment", async () => {
    await agent
      .delete("/api/comments/00000000-0000-0000-0000-000000000099")
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });
});
