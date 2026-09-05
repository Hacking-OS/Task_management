import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createTestUser, createWorkspaceFixture } from "../setup/fixtures.js";
import { notify, unreadCount } from "../../src/services/notifications.js";

describe("notifications API", () => {
  const agent = createApiAgent();

  it("lists notifications with unread count", async () => {
    const { owner } = createWorkspaceFixture("notif_list");
    notify({ userId: owner.id, type: "info", title: "Listed", message: "Hello" });

    const res = await agent
      .get("/api/notifications")
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.notifications.length).toBeGreaterThan(0);
    expect(res.body.unreadCount).toBe(unreadCount(owner.id));
  });

  it("marks a notification as read via PUT", async () => {
    const { owner } = createWorkspaceFixture("notif_api");
    const before = unreadCount(owner.id);
    const notification = notify({
      userId: owner.id,
      type: "info",
      title: "Test alert",
      message: "Please read me",
      workspaceId: undefined,
    });

    const res = await agent
      .put(`/api/notifications/${notification.id}/read`)
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.unreadCount).toBe(before);
  });

  it("marks a notification as read via PATCH", async () => {
    const { owner } = createWorkspaceFixture("notif_patch");
    const notification = notify({
      userId: owner.id,
      type: "info",
      title: "Patch read",
      message: "Use PATCH",
    });

    const res = await agent
      .patch(`/api/notifications/${notification.id}/read`)
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.unreadCount).toBe(unreadCount(owner.id));
  });

  it("returns 404 for unknown notification id", async () => {
    const { owner } = createWorkspaceFixture("notif_missing");
    await agent
      .put("/api/notifications/00000000-0000-0000-0000-000000000099/read")
      .set(authHeader(owner.accessToken))
      .expect(404);
  });

  it("returns 400 for empty notification id", async () => {
    const { owner } = createWorkspaceFixture("notif_empty");
    await agent
      .put("/api/notifications/%20/read")
      .set(authHeader(owner.accessToken))
      .expect(400);
  });

  it("marks all notifications read via PUT", async () => {
    const { owner } = createWorkspaceFixture("notif_all");
    notify({ userId: owner.id, type: "info", title: "A", message: "One" });
    notify({ userId: owner.id, type: "info", title: "B", message: "Two" });

    const res = await agent
      .put("/api/notifications/read-all")
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.unreadCount).toBe(0);
    expect(unreadCount(owner.id)).toBe(0);
  });

  it("marks all notifications read via POST", async () => {
    const { owner } = createWorkspaceFixture("notif_post_all");
    notify({ userId: owner.id, type: "info", title: "C", message: "Three" });
    notify({ userId: owner.id, type: "info", title: "D", message: "Four" });

    const res = await agent
      .post("/api/notifications/read-all")
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(res.body.unreadCount).toBe(0);
    expect(unreadCount(owner.id)).toBe(0);
  });

  it("cannot mark another user's notification", async () => {
    const ws = createWorkspaceFixture("notif_other");
    const other = createTestUser("notif_victim");
    const notification = notify({
      userId: other.id,
      type: "info",
      title: "Private",
      message: "Not yours",
    });

    await agent
      .put(`/api/notifications/${notification.id}/read`)
      .set(authHeader(ws.owner.accessToken))
      .expect(404);
  });

  it("deletes a notification", async () => {
    const { owner } = createWorkspaceFixture("notif_delete");
    const notification = notify({
      userId: owner.id,
      type: "info",
      title: "Remove me",
      message: "Bye",
    });

    await agent
      .delete(`/api/notifications/${notification.id}`)
      .set(authHeader(owner.accessToken))
      .expect(204);
  });
});
