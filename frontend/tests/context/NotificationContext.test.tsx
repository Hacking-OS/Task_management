import type { ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { NotificationProvider, useNotifications } from "../../src/context/NotificationContext";
import { ApiError } from "../../src/services/api";
import type { Notification } from "../../src/models/types";

const markNotificationRead = jest.fn();
const markAllNotificationsRead = jest.fn();
const deleteNotification = jest.fn();
const getNotifications = jest.fn();

jest.mock("../../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "test-token" }),
}));

jest.mock("../../src/context/WorkspaceContext", () => ({
  useWorkspace: () => ({ activeWorkspace: null, refresh: jest.fn() }),
}));

jest.mock("../../src/context/SocketContext", () => ({
  useSocket: () => ({ connected: true }),
}));

jest.mock("../../src/hooks/useSocketEvent", () => ({
  useSocketEvent: jest.fn(),
}));

jest.mock("../../src/services/api", () => ({
  ApiError: class ApiError extends Error {
    status?: number;
    constructor(message: string, extras?: { status?: number }) {
      super(message);
      this.name = "ApiError";
      this.status = extras?.status;
    }
  },
  api: {
    getNotifications: (...args: unknown[]) => getNotifications(...args),
    markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
    markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
    deleteNotification: (...args: unknown[]) => deleteNotification(...args),
    acceptInvitation: jest.fn(),
    rejectInvitation: jest.fn(),
    activateWorkspace: jest.fn(),
  },
}));

const sampleNotification: Notification = {
  id: "notif-1",
  user_id: "user-1",
  workspace_id: null,
  entity_type: null,
  entity_id: null,
  type: "info",
  title: "Test",
  message: "Hello",
  is_read: 0,
  created_at: "2026-01-01T00:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

describe("NotificationContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getNotifications.mockResolvedValue({
      notifications: [sampleNotification],
      unreadCount: 1,
    });
    markNotificationRead.mockResolvedValue({ unreadCount: 0 });
    markAllNotificationsRead.mockResolvedValue({ unreadCount: 0 });
    deleteNotification.mockResolvedValue(undefined);
  });

  it("markRead updates unread count on success", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(1);

    await act(async () => {
      await result.current.markRead("notif-1");
    });

    expect(markNotificationRead).toHaveBeenCalledWith("test-token", "notif-1");
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0]?.is_read).toBe(1);
  });

  it("markRead swallows server errors without throwing", async () => {
    markNotificationRead.mockRejectedValueOnce(new ApiError("Internal Server Error", { status: 500 }));

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.markRead("notif-1");
      }),
    ).resolves.toBeUndefined();
  });

  it("markRead removes stale notifications on 404", async () => {
    markNotificationRead.mockRejectedValueOnce(new ApiError("Notification not found", { status: 404 }));

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markRead("notif-1");
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("markAllRead swallows API failures", async () => {
    markAllNotificationsRead.mockRejectedValueOnce(new ApiError("Internal Server Error", { status: 500 }));

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.markAllRead();
      }),
    ).resolves.toBeUndefined();
  });
});
