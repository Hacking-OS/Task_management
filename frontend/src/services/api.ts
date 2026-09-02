import type {
  ActivityLog, Comment, CreateSubtaskInput, Issue, MyPermissions, Notification, PermissionMatrix,
  Permission, Severity, SeverityStats, DashboardStats, Subtask,   Task, User, Workspace, WorkspaceMember,
  WorkspaceRole, WorkspaceFile, FileCategory, TimeEntry, WorkspaceInvitation,
} from "../models/types";

const API = "/api";

function headers(token?: string, json = true): HeadersInit {
  const h: HeadersInit = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function uploadForm<T>(path: string, formData: FormData, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Upload failed");
  }
  return res.json();
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

  getSubtasks: (token: string, filters: { task_id?: string; issue_id?: string; severity?: Severity; workspace_id?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.task_id) params.set("task_id", filters.task_id);
    if (filters.issue_id) params.set("issue_id", filters.issue_id);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.workspace_id) params.set("workspace_id", filters.workspace_id);
    const q = params.toString();
    return request<{ subtasks: Subtask[] }>(`/subtasks${q ? `?${q}` : ""}`, {}, token);
  },

  createSubtask: (token: string, data: CreateSubtaskInput) =>
    request<{ subtask: Subtask }>("/subtasks", { method: "POST", body: JSON.stringify(data) }, token),

  updateSubtask: (token: string, id: string, data: Partial<Subtask>) =>
    request<{ subtask: Subtask }>(`/subtasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token),

  deleteSubtask: (token: string, id: string) =>
    request<void>(`/subtasks/${id}`, { method: "DELETE" }, token),

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

  getMyInvitations: (token: string) =>
    request<{ invitations: WorkspaceInvitation[] }>("/invitations/mine", {}, token),

  acceptInvitation: (token: string, inviteToken: string) =>
    request<{ workspaceId: string }>("/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: inviteToken }),
    }, token),

  rejectInvitation: (token: string, inviteToken: string) =>
    request<void>("/invitations/reject", {
      method: "POST",
      body: JSON.stringify({ token: inviteToken }),
    }, token),

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

  getWorkspaceStatuses: (token: string, workspaceId: string, entityType?: string) => {
    const q = entityType ? `?entity_type=${entityType}` : "";
    return request<{ statuses: import("../models/types").WorkspaceStatus[] }>(
      `/workspaces/${workspaceId}/statuses${q}`,
      {},
      token
    );
  },

  getPermissionCatalog: (token: string, workspaceId: string) =>
    request<{ permissions: Permission[] }>(`/workspaces/${workspaceId}/permissions/catalog`, {}, token),

  getPermissionMatrix: (token: string, workspaceId: string) =>
    request<PermissionMatrix>(`/workspaces/${workspaceId}/permissions`, {}, token),

  getMyPermissions: (token: string, workspaceId: string) =>
    request<MyPermissions>(`/workspaces/${workspaceId}/permissions/me`, {}, token),

  updateRolePermissions: (token: string, workspaceId: string, roleId: string, permissions: string[]) =>
    request<{ role: WorkspaceRole }>(`/workspaces/${workspaceId}/roles/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }, token),

  resetRolePermissions: (token: string, workspaceId: string, roleId: string) =>
    request<{ role: WorkspaceRole }>(`/workspaces/${workspaceId}/roles/${roleId}/reset`, { method: "POST" }, token),

  createRole: (token: string, workspaceId: string, name: string, permissions: string[] = []) =>
    request<{ role: WorkspaceRole }>(`/workspaces/${workspaceId}/roles`, {
      method: "POST",
      body: JSON.stringify({ name, permissions }),
    }, token),

  deleteRole: (token: string, workspaceId: string, roleId: string) =>
    request<void>(`/workspaces/${workspaceId}/roles/${roleId}`, { method: "DELETE" }, token),

  listMembers: (token: string, workspaceId: string) =>
    request<{ members: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`, {}, token),

  getMember: (token: string, workspaceId: string, memberId: string) =>
    request<{ member: WorkspaceMember }>(`/workspaces/${workspaceId}/members/${memberId}`, {}, token),

  updateMemberPermissions: (
    token: string,
    workspaceId: string,
    memberId: string,
    overrides: { permission_code: string; effect: "grant" | "deny" }[]
  ) =>
    request<{ member: WorkspaceMember }>(`/workspaces/${workspaceId}/members/${memberId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ overrides }),
    }, token),

  resetMemberPermissions: (token: string, workspaceId: string, memberId: string) =>
    request<{ member: WorkspaceMember }>(`/workspaces/${workspaceId}/members/${memberId}/permissions/reset`, {
      method: "POST",
    }, token),

  listFiles: (token: string, workspaceId: string, filters?: { category?: FileCategory; entity_id?: string }) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set("category", filters.category);
    if (filters?.entity_id) params.set("entity_id", filters.entity_id);
    const q = params.toString();
    return request<{ files: WorkspaceFile[] }>(`/workspaces/${workspaceId}/files${q ? `?${q}` : ""}`, {}, token);
  },

  uploadFile: (token: string, workspaceId: string, file: File, category: FileCategory, entityId: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    form.append("entity_id", entityId);
    return uploadForm<{ file: WorkspaceFile }>(`/workspaces/${workspaceId}/files/upload`, form, token);
  },

  fileDownloadUrl: (fileId: string) => `${API}/files/${fileId}`,

  deleteFile: (token: string, fileId: string) =>
    request<void>(`/files/${fileId}`, { method: "DELETE" }, token),

  downloadFile: async (token: string, fileId: string, filename: string) => {
    const res = await fetch(`${API}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? "Download failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  fetchFileBlob: async (token: string, fileId: string): Promise<Blob> => {
    const res = await fetch(`${API}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? "Failed to load file");
    }
    return res.blob();
  },

  uploadAvatar: (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return uploadForm<{ user: User; avatar_url: string }>("/users/me/avatar", form, token);
  },

  getSeverityStats: (token: string, workspaceId?: string) => {
    const q = workspaceId ? `?workspace_id=${workspaceId}` : "";
    return request<{ stats: SeverityStats }>(`/stats/severity${q}`, {}, token);
  },

  getDashboardStats: (token: string, workspaceId?: string) => {
    const q = workspaceId ? `?workspace_id=${workspaceId}` : "";
    return request<{ stats: DashboardStats }>(`/stats/dashboard${q}`, {}, token);
  },

  listTimeEntries: (token: string, workspaceId: string, filters?: { entity_type?: string; entity_id?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.entity_type) params.set("entity_type", filters.entity_type);
    if (filters?.entity_id) params.set("entity_id", filters.entity_id);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    const q = params.toString();
    return request<{ entries: TimeEntry[] }>(`/workspaces/${workspaceId}/time-entries${q ? `?${q}` : ""}`, {}, token);
  },

  getTimeSummary: (token: string, workspaceId: string, filters?: { from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    const q = params.toString();
    return request<{ summary: { totalHours: number; entryCount: number } }>(`/workspaces/${workspaceId}/time-entries/summary${q ? `?${q}` : ""}`, {}, token);
  },

  createTimeEntry: (token: string, workspaceId: string, data: {
    entity_type: string;
    entity_id: string;
    work_date: string;
    hours: number;
    description?: string;
  }) =>
    request<{ entry: TimeEntry }>(`/workspaces/${workspaceId}/time-entries`, {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  deleteTimeEntry: (token: string, workspaceId: string, entryId: string) =>
    request<void>(`/workspaces/${workspaceId}/time-entries/${entryId}`, { method: "DELETE" }, token),
};
