import {
  notify,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  unreadCount,
  listNotifications,
} from "../../src/services/notifications.js";
import { createTestUser, createWorkspaceFixture } from "../setup/fixtures.js";

describe("notification service", () => {
  it("creates notification and increments unread count", () => {
    const user = createTestUser("notif_create");
    const before = unreadCount(user.id);

    notify({ userId: user.id, type: "info", title: "Hello", message: "World" });

    expect(unreadCount(user.id)).toBe(before + 1);
    const list = listNotifications(user.id);
    expect(list.some((n) => n.title === "Hello")).toBe(true);
  });

  it("markNotificationRead decrements unread count", () => {
    const user = createTestUser("notif_read");
    const before = unreadCount(user.id);
    const n = notify({ userId: user.id, type: "info", title: "Read me", message: "..." });

    expect(markNotificationRead(user.id, n.id)).toBe(true);
    expect(unreadCount(user.id)).toBe(before);
    expect(listNotifications(user.id, true).some((item) => item.id === n.id)).toBe(false);
  });

  it("markAllNotificationsRead clears unread", () => {
    const user = createTestUser("notif_all_svc");
    notify({ userId: user.id, type: "info", title: "A", message: "1" });
    notify({ userId: user.id, type: "warning", title: "B", message: "2" });

    markAllNotificationsRead(user.id);
    expect(unreadCount(user.id)).toBe(0);
  });

  it("deleteNotification removes record", () => {
    const user = createTestUser("notif_del");
    const n = notify({ userId: user.id, type: "info", title: "Del", message: "x" });

    expect(deleteNotification(user.id, n.id)).toBe(true);
    expect(listNotifications(user.id).some((item) => item.id === n.id)).toBe(false);
  });

  it("scopes list by workspace when provided", () => {
    const { id: wsId, owner } = createWorkspaceFixture("notif_ws");
    notify({ userId: owner.id, type: "info", title: "In ws", message: "x", workspaceId: wsId });
    notify({ userId: owner.id, type: "info", title: "Global", message: "y" });

    const scoped = listNotifications(owner.id, false, wsId);
    expect(scoped.some((n) => n.title === "In ws")).toBe(true);
    expect(scoped.some((n) => n.title === "Global")).toBe(true);
  });
});
