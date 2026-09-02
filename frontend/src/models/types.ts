export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
  avatar_url?: string | null;
}

export type TaskStatus = string;
export type IssueStatus = string;
export type StatusEntityType = "task" | "issue" | "subtask";

export interface WorkspaceStatus {
  id: string;
  workspace_id: string;
  entity_type: StatusEntityType;
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_closed: number;
  created_at: string;
}
export type Priority = "low" | "medium" | "high";
export type Severity =
  | "blocker"
  | "critical"
  | "urgent"
  | "high"
  | "major"
  | "elevated"
  | "medium"
  | "moderate"
  | "low"
  | "minor"
  | "trivial"
  | "cosmetic"
  | "enhancement"
  | "documentation"
  | "informational";
export type SeverityFilter = Severity | "all";
export type EntityType = "task" | "issue" | "subtask" | "assignment" | "workspace" | "comment" | "file" | "user";

export type NotificationType =
  | "info" | "login" | "task" | "issue" | "subtask" | "assignment"
  | "workspace" | "invite" | "comment" | "file" | "success" | "warning" | "mention";

export interface Task {
  id: string;
  user_id: string;
  workspace_id: string | null;
  assignee_id: string | null;
  assignee_ids?: string[];
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  severity: Severity;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Issue {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  severity: Severity;
  assignee_id: string | null;
  assignee_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: string;
  user_id: string;
  task_id: string | null;
  issue_id: string | null;
  workspace_id: string | null;
  title: string;
  status: string;
  severity: Severity;
  assignee_id: string | null;
  assignee_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  workspace_id: string | null;
  entity_type: string;
  entity_id: string;
  body: string;
  created_at: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  invited_by: string;
  role_id: string;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  role_name?: string;
  invited_by_username?: string;
  workspace_name?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  workspace_id: string | null;
  entity_type: EntityType | null;
  entity_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: string | null;
  is_read: number;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  workspace_id: string | null;
  user_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  description: string;
  metadata: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type FileCategory = "task" | "subtask" | "issue" | "comment" | "general";

export interface WorkspaceFile {
  id: string;
  user_id: string;
  workspace_id: string;
  filename: string;
  stored_path: string;
  size: number;
  category: FileCategory;
  entity_id: string | null;
  mime_type: string;
  created_at: string;
}

export type SeverityCounts = Record<Severity, number>;

export interface SeverityStats {
  tasks: SeverityCounts;
  issues: SeverityCounts;
  subtasks: SeverityCounts;
}

export interface CompletionStats {
  total: number;
  closed: number;
  percent: number;
}

export interface TaskSubtaskProgress {
  tasksWithSubtasks: number;
  avgSubtaskPercent: number;
  totalSubtasks: number;
  closedSubtasks: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface DashboardStats {
  severity: SeverityStats;
  totals: {
    tasks: number;
    issues: number;
    subtasks: number;
  };
  byStatus: {
    tasks: StatusCount[];
    issues: StatusCount[];
    subtasks: StatusCount[];
  };
  completion: {
    tasks: CompletionStats;
    issues: CompletionStats;
    subtasks: CompletionStats;
    overall: CompletionStats;
    taskSubtaskProgress: TaskSubtaskProgress;
  };
}

export interface TimeEntry {
  id: string;
  user_id: string;
  workspace_id: string;
  entity_type: "task" | "issue" | "subtask";
  entity_id: string;
  work_date: string;
  hours: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSubtaskInput {
  title: string;
  task_id?: string;
  issue_id?: string;
  workspace_id?: string;
  severity?: Severity;
  assignee_id?: string | null;
  assignee_ids?: string[];
}

export interface Permission {
  code: string;
  name: string;
  description: string;
  group: string;
}

export interface WorkspaceRole {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  is_system: number;
  created_at: string;
  updated_at: string;
  permissions?: string[];
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role_id: string;
  joined_at: string;
  username: string;
  email: string;
  role_name: string;
  role_slug: string;
  avatar_url?: string | null;
  role_permissions?: string[];
  permission_overrides?: { grants: string[]; denies: string[] };
  effective_permissions?: string[];
}

export interface PermissionMatrix {
  roles: WorkspaceRole[];
  permissions: Permission[];
}

export interface MyPermissions {
  permissions: string[];
  is_owner: boolean;
  is_creator: boolean;
  role_slug: string | null;
  role_name: string | null;
}
