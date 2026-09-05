import type {
  ActivityLog, ApprovalRequest, AppVersion, Comment, CreateSubtaskInput, InvitationPreview, Issue, MyPermissions, Notification, PermissionMatrix,
  Permission, Severity, SeverityStats, DashboardStats, Subtask, Task, User, Workspace, WorkspaceMember,
  WorkspaceRole, WorkspaceFile, FileCategory, TimeEntry, WorkspaceInvitation,
  WorkspaceTeam, TeamJoinRequest, TeamJoinStatusInfo, TeamAssignment, RolePermissionEffect,
} from "../models/types";

const API = "/api";

export class ApiError extends Error {
  status?: number;
  permission?: string;
  approval_available?: boolean;
  retryAfter?: number;

  constructor(
    message: string,
    extras?: { status?: number; permission?: string; approval_available?: boolean; retryAfter?: number }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = extras?.status;
    this.permission = extras?.permission;
    this.approval_available = extras?.approval_available;
    this.retryAfter = extras?.retryAfter;
  }
}

let workspaceSecurityVersion: number | undefined;

export function setWorkspaceSecurityVersion(version: number | undefined): void {
  workspaceSecurityVersion = version && version > 0 ? version : undefined;
}

function headers(token?: string, json = true): HeadersInit {
  const h: HeadersInit = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  if (workspaceSecurityVersion) {
    h["X-Workspace-Security-Version"] = String(workspaceSecurityVersion);
  }
  return h;
}

async function uploadForm<T>(path: string, formData: FormData, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Upload failed");
  }
  return res.json();
}

import { dedupeInFlight, requestKey } from "./requestCache";
import {
  getAccessToken,
  notifySessionExpired,
  notifyTokenRefreshed,
} from "./authToken";

const duplicateWindowMs = 100;
const recentRequests = new Map<string, number>();

let refreshPromise: Promise<string | null> | null = null;

export interface AuthResponse {
  user: User;
  accessToken: string;
  expiresIn: number;
  joined_workspace_ids?: string[];
}

async function refreshSessionSingleFlight(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthResponse;
      notifyTokenRefreshed(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function logPossibleDuplicate(method: string, path: string, token?: string): void {
  if (!import.meta.env.DEV) return;
  const key = requestKey(method, path, token);
  const now = Date.now();
  const last = recentRequests.get(key);
  if (last !== undefined && now - last < duplicateWindowMs) {
    console.warn("[API] Possible duplicate request:", `${method} ${path}`);
  }
  recentRequests.set(key, now);
}

const AUTH_REFRESH_PATHS = ["/auth/refresh", "/auth/login", "/auth/register"];

async function requestInner<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  retried = false
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const bearer = token ?? getAccessToken() ?? undefined;
  logPossibleDuplicate(method, path, bearer);

  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: { ...headers(bearer), ...options.headers },
  });

  if (res.status === 401 && !AUTH_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    if (!retried) {
      const newToken = await refreshSessionSingleFlight();
      if (newToken) {
        return requestInner<T>(path, options, newToken, true);
      }
    }
    notifySessionExpired();
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? "Session expired", { status: 401 });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
    throw new ApiError(body.error ?? "Request failed", {
      status: res.status,
      permission: body.permission,
      approval_available: body.approval_available,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
    });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const key = requestKey(method, path, token);
    return dedupeInFlight(key, () => requestInner<T>(path, options, token));
  }
  return requestInner<T>(path, options, token);
}

export const api = {
  restoreSession: () => requestInner<AuthResponse>("/auth/refresh", { method: "POST" }),

  login: (username: string, password: string) =>
    requestInner<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, email: string, password: string, inviteToken?: string) =>
    requestInner<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password, invite_token: inviteToken }),
    }),

  me: (token: string) => request<{ user: User }>("/users/me", {}, token),

  logout: (token?: string) =>
    requestInner<void>("/auth/logout", { method: "POST" }, token),

  logoutAll: (token: string) =>
    requestInner<void>("/auth/logout-all", { method: "POST" }, token),

  getSessions: (token: string) =>
    request<{ sessions: import("../models/types").UserSession[] }>("/auth/sessions", {}, token),

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

  markNotificationRead: (token: string, id: string) => {
    const notificationId = id?.trim();
    if (!notificationId) {
      return Promise.reject(new ApiError("Notification id is required", { status: 400 }));
    }
    return request<{ unreadCount: number }>(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PUT" },
      token,
    );
  },

  markAllNotificationsRead: (token: string) =>
    request<{ unreadCount: number }>("/notifications/read-all", { method: "PUT" }, token),

  deleteNotification: (token: string, id: string) => {
    const notificationId = id?.trim();
    if (!notificationId) {
      return Promise.reject(new ApiError("Notification id is required", { status: 400 }));
    }
    return request<void>(`/notifications/${encodeURIComponent(notificationId)}`, { method: "DELETE" }, token);
  },

  getMyInvitations: (token: string) =>
    request<{ invitations: WorkspaceInvitation[] }>("/invitations/mine", {}, token),

  previewInvitation: (ref: string) =>
    request<{ preview: InvitationPreview }>(`/invitations/preview/${encodeURIComponent(ref)}`),

  createInvitation: (token: string, workspaceId: string, email: string, roleId: string) =>
    request<{ invitation: WorkspaceInvitation }>(`/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role_id: roleId }),
    }, token),

  listWorkspaceInvitations: (token: string, workspaceId: string) =>
    request<{ invitations: WorkspaceInvitation[] }>(`/workspaces/${workspaceId}/invitations`, {}, token),

  revokeInvitation: (token: string, workspaceId: string, invitationId: string) =>
    request<void>(`/workspaces/${workspaceId}/invitations/${invitationId}/revoke`, { method: "POST" }, token),

  acceptInvitation: (token: string, ref: string) =>
    request<{ workspaceId: string }>("/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: ref, code: ref }),
    }, token),

  rejectInvitation: (token: string, ref: string) =>
    request<void>("/invitations/reject", {
      method: "POST",
      body: JSON.stringify({ token: ref, code: ref }),
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

  updateRolePermissionEffects: (
    token: string,
    workspaceId: string,
    roleId: string,
    permission_effects: RolePermissionEffect[]
  ) =>
    request<{ role: WorkspaceRole }>(`/workspaces/${workspaceId}/roles/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permission_effects }),
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

  changeMemberRole: (token: string, workspaceId: string, memberId: string, roleId: string) =>
    request<{ member: WorkspaceMember }>(`/workspaces/${workspaceId}/members/${memberId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role_id: roleId }),
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

  getVersion: () => request<AppVersion>("/version"),

  setApprovalFlowsEnabled: (token: string, workspaceId: string, enabled: boolean) =>
    request<{ workspace: Workspace }>(`/workspaces/${workspaceId}/approval-flows`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }, token),

  listPendingApprovals: (token: string, workspaceId: string) =>
    request<{ requests: ApprovalRequest[] }>(`/workspaces/${workspaceId}/approvals/pending`, {}, token),

  listApprovals: (
    token: string,
    workspaceId: string,
    filters?: { status?: string; mine?: boolean }
  ) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.mine) params.set("mine", "true");
    const q = params.toString();
    return request<{ requests: ApprovalRequest[] }>(`/workspaces/${workspaceId}/approvals${q ? `?${q}` : ""}`, {}, token);
  },

  listMyApprovalRequests: (token: string, workspaceId: string) =>
    request<{ requests: ApprovalRequest[] }>(`/workspaces/${workspaceId}/approvals/mine`, {}, token),

  createApprovalRequest: (
    token: string,
    workspaceId: string,
    data: { permission_code: string; title?: string; description?: string }
  ) =>
    request<{ request: ApprovalRequest }>(`/workspaces/${workspaceId}/approvals`, {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  approveRequest: (token: string, workspaceId: string, requestId: string) =>
    request<{ request: ApprovalRequest }>(`/workspaces/${workspaceId}/approvals/${requestId}/approve`, {
      method: "POST",
    }, token),

  rejectApprovalRequest: (token: string, workspaceId: string, requestId: string, note?: string) =>
    request<{ request: ApprovalRequest }>(`/workspaces/${workspaceId}/approvals/${requestId}/reject`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? "" }),
    }, token),

  listTeams: (token: string, workspaceId: string) =>
    request<{ teams: WorkspaceTeam[] }>(`/workspaces/${workspaceId}/teams`, {}, token),

  getTeam: (token: string, workspaceId: string, teamId: string) =>
    request<{ team: WorkspaceTeam }>(`/workspaces/${workspaceId}/teams/${teamId}`, {}, token),

  createTeam: (token: string, workspaceId: string, data: { name: string; description?: string; lead_member_id?: string }) =>
    request<{ team: WorkspaceTeam }>(`/workspaces/${workspaceId}/teams`, {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  updateTeam: (token: string, workspaceId: string, teamId: string, data: { name?: string; description?: string }) =>
    request<{ team: WorkspaceTeam }>(`/workspaces/${workspaceId}/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }, token),

  deleteTeam: (token: string, workspaceId: string, teamId: string) =>
    request<void>(`/workspaces/${workspaceId}/teams/${teamId}`, { method: "DELETE" }, token),

  requestTeamJoin: (token: string, workspaceId: string, teamId: string, reason?: string) =>
    request<{ request: TeamJoinRequest }>(`/workspaces/${workspaceId}/teams/${teamId}/join-requests`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? "" }),
    }, token),

  getMyTeamJoinStatus: (token: string, workspaceId: string, teamId: string) =>
    request<TeamJoinStatusInfo>(`/workspaces/${workspaceId}/teams/${teamId}/my-join-status`, {}, token),

  listTeamJoinRequests: (token: string, workspaceId: string, teamId: string, status?: string) => {
    const q = status ? `?status=${status}` : "";
    return request<{ requests: TeamJoinRequest[] }>(
      `/workspaces/${workspaceId}/teams/${teamId}/join-requests${q}`,
      {},
      token
    );
  },

  approveTeamJoinRequest: (token: string, workspaceId: string, requestId: string) =>
    request<{ request: TeamJoinRequest }>(`/workspaces/${workspaceId}/team-join-requests/${requestId}/approve`, {
      method: "POST",
    }, token),

  rejectTeamJoinRequest: (token: string, workspaceId: string, requestId: string, reason?: string) =>
    request<{ request: TeamJoinRequest }>(`/workspaces/${workspaceId}/team-join-requests/${requestId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? "" }),
    }, token),

  assignTeamToEntity: (
    token: string,
    workspaceId: string,
    data: { team_id: string; entity_type: string; entity_id: string }
  ) =>
    request<{ assignment: TeamAssignment }>(`/workspaces/${workspaceId}/team-assignments`, {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  removeTeamFromEntity: (
    token: string,
    workspaceId: string,
    data: { team_id: string; entity_type: string; entity_id: string }
  ) =>
    request<void>(`/workspaces/${workspaceId}/team-assignments`, {
      method: "DELETE",
      body: JSON.stringify(data),
    }, token),

  getSecurityEvents: (token: string, workspaceId: string, params?: { risk_level?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    if (params?.limit) q.set("limit", String(params.limit));
    const query = q.toString();
    return request<{ events: import("../models/types").SecurityEvent[] }>(
      `/security/workspaces/${workspaceId}/events${query ? `?${query}` : ""}`,
      {},
      token
    );
  },

  getWorkspaceOverview: (token: string, workspaceId: string) =>
    request<{ overview: import("../models/types").WorkspaceOverviewStats }>(
      `/workspaces/${workspaceId}/overview`,
      {},
      token
    ),

  getMemberSummary: (token: string, workspaceId: string, memberId: string) =>
    request<{ summary: import("../models/types").MemberManagementSummary }>(
      `/workspaces/${workspaceId}/members/${memberId}/summary`,
      {},
      token
    ),

  listProjects: (token: string, workspaceId: string, filters?: { status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.search) params.set("search", filters.search);
    const q = params.toString();
    return request<{ projects: import("../models/types").ProjectSummary[] }>(
      `/workspaces/${workspaceId}/projects${q ? `?${q}` : ""}`,
      {},
      token
    );
  },

  getProject: (token: string, workspaceId: string, projectId: string) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(
      `/workspaces/${workspaceId}/projects/${projectId}`,
      {},
      token
    ),

  createProject: (
    token: string,
    workspaceId: string,
    data: { name: string; description?: string; lead_member_id?: string | null }
  ) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  updateProject: (
    token: string,
    workspaceId: string,
    projectId: string,
    data: { name?: string; description?: string; status?: import("../models/types").ProjectStatus }
  ) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(
      `/workspaces/${workspaceId}/projects/${projectId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token
    ),

  deleteProject: (token: string, workspaceId: string, projectId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}`, { method: "DELETE" }, token),

  setProjectTeams: (token: string, workspaceId: string, projectId: string, teamIds: string[]) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(
      `/workspaces/${workspaceId}/projects/${projectId}/teams`,
      { method: "PUT", body: JSON.stringify({ team_ids: teamIds }) },
      token
    ),

  addProjectMember: (
    token: string,
    workspaceId: string,
    projectId: string,
    data: { member_id: string; role_in_project?: import("../models/types").ProjectRoleInProject }
  ) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(
      `/workspaces/${workspaceId}/projects/${projectId}/members`,
      { method: "POST", body: JSON.stringify(data) },
      token
    ),

  removeProjectMember: (token: string, workspaceId: string, projectId: string, memberId: string) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(
      `/workspaces/${workspaceId}/projects/${projectId}/members/${memberId}`,
      { method: "DELETE" },
      token
    ),

  setProjectLead: (token: string, workspaceId: string, projectId: string, memberId: string | null) =>
    request<{ project: import("../models/types").ProjectWithDetails }>(
      `/workspaces/${workspaceId}/projects/${projectId}/lead`,
      { method: "PUT", body: JSON.stringify({ member_id: memberId }) },
      token
    ),

  listTeamProjects: (token: string, workspaceId: string, teamId: string) =>
    request<{ projects: import("../models/types").ProjectSummary[] }>(
      `/workspaces/${workspaceId}/teams/${teamId}/projects`,
      {},
      token
    ),
};
