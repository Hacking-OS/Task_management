import type {
  ActivityLog, Comment, Issue, Notification, Subtask, Task, User, Workspace, Severity, SeverityStats,
} from "./types";

const API = "/api";

function headers(token?: string): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers(token), ...options.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: User; token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  register: (username: string, email: string, password: string) =>
    request<{ user: User; token: string }>("/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) }),

  me: (token: string) => request<{ user: User }>("/users/me", {}, token),

  getTasks: (token: string, workspaceId?: string, severity?: Severity) => {
    const params = new URLSearchParams();
    if (workspaceId) params.set("workspace_id", workspaceId);
    if (severity) params.set("severity", severity);
    const q = params.toString();
    return request<{ tasks: Task[] }>(`/tasks${q ? `?${q}` : ""}`, {}, token);
  },

  getTask: (token: string, id: string) => request<{ task: Task }>(`/tasks/${id}`, {}, token),

  getTaskActivity: (token: string, id: string) =>
    request<{ logs: ActivityLog[] }>(`/tasks/${id}/activity`, {}, token),

  createTask: (token: string, data: Partial<Task> & { title: string }) =>
    request<{ task: Task }>("/tasks", { method: "POST", body: JSON.stringify(data) }, token),

  updateTask: (token: string, id: string, data: Partial<Task>) =>
    request<{ task: Task }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token),

  deleteTask: (token: string, id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" }, token),

  getIssues: (token: string, workspaceId?: string, severity?: Severity) => {
    const params = new URLSearchParams();
    if (workspaceId) params.set("workspace_id", workspaceId);
    if (severity) params.set("severity", severity);
    const q = params.toString();
    return request<{ issues: Issue[] }>(`/issues${q ? `?${q}` : ""}`, {}, token);
  },

  getIssue: (token: string, id: string) => request<{ issue: Issue }>(`/issues/${id}`, {}, token),

  getIssueActivity: (token: string, id: string) =>
    request<{ logs: ActivityLog[] }>(`/issues/${id}/activity`, {}, token),

  createIssue: (token: string, data: Partial<Issue> & { title: string }) =>
    request<{ issue: Issue }>("/issues", { method: "POST", body: JSON.stringify(data) }, token),

  updateIssue: (token: string, id: string, data: Partial<Issue>) =>
    request<{ issue: Issue }>(`/issues/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token),

  deleteIssue: (token: string, id: string) => request<void>(`/issues/${id}`, { method: "DELETE" }, token),

  getSubtasks: (token: string, filters: { task_id?: string; issue_id?: string; severity?: Severity }) => {
    const params = new URLSearchParams();
    if (filters.task_id) params.set("task_id", filters.task_id);
    if (filters.issue_id) params.set("issue_id", filters.issue_id);
    if (filters.severity) params.set("severity", filters.severity);
    return request<{ subtasks: Subtask[] }>(`/subtasks?${params}`, {}, token);
  },

  createSubtask: (token: string, data: { title: string; task_id?: string; issue_id?: string; workspace_id?: string }) =>
    request<{ subtask: Subtask }>("/subtasks", { method: "POST", body: JSON.stringify(data) }, token),

  updateSubtask: (token: string, id: string, data: Partial<Subtask>) =>
    request<{ subtask: Subtask }>(`/subtasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token),

  getComments: (token: string, entityType: string, entityId: string) =>
    request<{ comments: Comment[] }>(`/comments?entity_type=${entityType}&entity_id=${entityId}`, {}, token),

  createComment: (token: string, data: { entity_type: string; entity_id: string; body: string; workspace_id?: string }) =>
    request<{ comment: Comment }>("/comments", { method: "POST", body: JSON.stringify(data) }, token),

  getNotifications: (token: string, workspaceId?: string) => {
    const q = workspaceId ? `?workspace_id=${workspaceId}` : "";
    return request<{ notifications: Notification[]; unreadCount: number }>(`/notifications${q}`, {}, token);
  },

  markNotificationRead: (token: string, id: string) =>
    request<{ unreadCount: number }>(`/notifications/${id}/read`, { method: "PUT" }, token),

  markAllNotificationsRead: (token: string) =>
    request<{ unreadCount: number }>("/notifications/read-all", { method: "PUT" }, token),

  deleteNotification: (token: string, id: string) =>
    request<void>(`/notifications/${id}`, { method: "DELETE" }, token),

  getActivityLogs: (token: string, filters?: { workspace_id?: string; entity_type?: string; entity_id?: string }) => {
    const params = new URLSearchParams();
    if (filters?.workspace_id) params.set("workspace_id", filters.workspace_id);
    if (filters?.entity_type) params.set("entity_type", filters.entity_type);
    if (filters?.entity_id) params.set("entity_id", filters.entity_id);
    const q = params.toString();
    return request<{ logs: ActivityLog[] }>(`/activity-logs${q ? `?${q}` : ""}`, {}, token);
  },

  getWorkspaceActivity: (token: string, id: string) =>
    request<{ logs: ActivityLog[] }>(`/workspaces/${id}/activity`, {}, token),

  getWorkspaces: (token: string) =>
    request<{ workspaces: Workspace[]; active: Workspace | undefined }>("/workspaces", {}, token),

  createWorkspace: (token: string, data: { name: string; description?: string }) =>
    request<{ workspace: Workspace }>("/workspaces", { method: "POST", body: JSON.stringify(data) }, token),

  activateWorkspace: (token: string, id: string) =>
    request<{ workspace: Workspace }>(`/workspaces/${id}/activate`, { method: "POST" }, token),

  deleteWorkspace: (token: string, id: string) =>
    request<void>(`/workspaces/${id}`, { method: "DELETE" }, token),

  getSeverityStats: (token: string, workspaceId?: string) => {
    const q = workspaceId ? `?workspace_id=${workspaceId}` : "";
    return request<{ stats: SeverityStats }>(`/stats/severity${q}`, {}, token);
  },
};
