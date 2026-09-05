import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createWorkspaceFixture, type TestUser, type WorkspaceFixture } from "../setup/fixtures.js";

describe("time entry API", () => {
  const agent = createApiAgent();
  let fixture: WorkspaceFixture;

  beforeEach(() => {
    fixture = createWorkspaceFixture("time");
  });

  async function createTask(owner: TestUser, workspaceId: string) {
    const res = await agent
      .post(`/api/workspaces/${workspaceId}/tasks`)
      .set(authHeader(owner.accessToken))
      .send({ title: "Timesheet Task" })
      .expect(201);
    return res.body.task as { id: string };
  }

  it("supports full CRUD lifecycle for time entries", async () => {
    const task = await createTask(fixture.owner, fixture.id);
    const workDate = "2026-03-01";

    const createRes = await agent
      .post(`/api/workspaces/${fixture.id}/time-entries`)
      .set(authHeader(fixture.owner.accessToken))
      .send({
        entity_type: "task",
        entity_id: task.id,
        work_date: workDate,
        hours: 2.5,
        description: "Initial implementation",
      })
      .expect(201);

    const entryId = createRes.body.entry.id as string;
    expect(createRes.body.entry.hours).toBe(2.5);

    const listRes = await agent
      .get(`/api/workspaces/${fixture.id}/time-entries`)
      .query({ entity_type: "task", entity_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);
    expect(listRes.body.entries.some((e: { id: string }) => e.id === entryId)).toBe(true);

    const summaryRes = await agent
      .get(`/api/workspaces/${fixture.id}/time-entries/summary`)
      .query({ from: workDate, to: workDate })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);
    expect(summaryRes.body.summary.entryCount).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.summary.totalHours).toBeGreaterThanOrEqual(2.5);

    const patchRes = await agent
      .patch(`/api/workspaces/${fixture.id}/time-entries/${entryId}`)
      .set(authHeader(fixture.owner.accessToken))
      .send({ hours: 3, description: "Extended work" })
      .expect(200);
    expect(patchRes.body.entry.hours).toBe(3);

    await agent
      .delete(`/api/workspaces/${fixture.id}/time-entries/${entryId}`)
      .set(authHeader(fixture.owner.accessToken))
      .expect(204);

    const afterList = await agent
      .get(`/api/workspaces/${fixture.id}/time-entries`)
      .query({ entity_type: "task", entity_id: task.id })
      .set(authHeader(fixture.owner.accessToken))
      .expect(200);
    expect(afterList.body.entries.some((e: { id: string }) => e.id === entryId)).toBe(false);
  });

  it("rejects unauthenticated access", async () => {
    await agent.get(`/api/workspaces/${fixture.id}/time-entries`).expect(401);
    await agent.post(`/api/workspaces/${fixture.id}/time-entries`).send({}).expect(401);
  });
});
