import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, type TestUser, type WorkspaceFixture } from "../setup/fixtures.js";

describe("file API", () => {
  const agent = createApiAgent();
  let fixture: WorkspaceFixture;

  beforeEach(() => {
    fixture = createWorkspaceFixture("files");
  });

  async function createTask(owner: TestUser, workspaceId: string) {
    const res = await agent
      .post(`/api/workspaces/${workspaceId}/tasks`)
      .set(authHeader(owner.accessToken))
      .send({ title: "File Parent Task" })
      .expect(201);
    return res.body.task as { id: string };
  }

  it("uploads, lists, downloads, and deletes a general file", async () => {
    const buffer = Buffer.from("hello file content");

    const uploadRes = await agent
      .post(`/api/workspaces/${fixture.id}/files/upload`)
      .set(authHeader(fixture.owner.accessToken))
      .attach("file", buffer, { filename: "notes.txt", contentType: "text/plain" })
      .field("category", "general")
      .expect(201);

    const fileId = uploadRes.body.file.id as string;
    expect(uploadRes.body.file.filename).toBe("notes.txt");

    const listRes = await agent
      .get(`/api/workspaces/${fixture.id}/files`)
      .query({ category: "general" })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);
    expect(listRes.body.files.some((f: { id: string }) => f.id === fileId)).toBe(true);

    const downloadRes = await agent
      .get(`/api/files/${fileId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);
    expect(downloadRes.text).toBe("hello file content");

    await agent
      .delete(`/api/files/${fileId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(204);

    await agent
      .get(`/api/files/${fileId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(404);
  });

  it("uploads a task-attached file with entity_id", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const buffer = Buffer.from("task attachment");

    const uploadRes = await agent
      .post(`/api/workspaces/${fixture.id}/files/upload`)
      .set(authHeader(fixture.owner.accessToken))
      .attach("file", buffer, { filename: "spec.pdf", contentType: "application/pdf" })
      .field("category", "task")
      .field("entity_id", task.id)
      .expect(201);

    expect(uploadRes.body.file.entity_id).toBe(task.id);

    const listRes = await agent
      .get(`/api/workspaces/${fixture.id}/files`)
      .query({ category: "task", entity_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);
    expect(listRes.body.files.length).toBeGreaterThan(0);
  });

  it("rejects upload without file", async () => {
    await agent
      .post(`/api/workspaces/${fixture.id}/files/upload`)
      .set(authHeader(fixture.owner.accessToken))
      .field("category", "general")
      .expect(400);
  });

  it("rejects unauthenticated file access", async () => {
    await agent.get(`/api/workspaces/${fixture.id}/files`).expect(401);
    await agent.get("/api/files/00000000-0000-0000-0000-000000000099").expect(401);
  });
});
