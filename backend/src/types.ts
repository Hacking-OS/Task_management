export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
  avatar_url?: string | null;
}

export type FileCategory = "task" | "subtask" | "issue" | "comment" | "general";

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  approval_flows_enabled?: number;
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
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
export type EntityType = "task" | "issue" | "subtask" | "assignment" | "workspace" | "comment" | "file" | "user";

export type NotificationType =
  | "info"
  | "login"
  | "task"
  | "issue"
  | "subtask"
  | "assignment"
  | "workspace"
  | "invite"
  | "comment"
  | "file"
  | "success"
  | "warning"
  | "mention";

export interface Task {
  id: string;
  user_id: string;
  workspace_id: string | null;
  assignee_id: string | null;
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
  status: "todo" | "done";
  severity: Severity;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  user_id: string;
  assignee_id: string;
  workspace_id: string | null;
  entity_type: "task" | "issue" | "subtask";
  entity_id: string;
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

export interface Notification {
  id: string;
  user_id: string;
  workspace_id: string | null;
  entity_type: EntityType | null;
  entity_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  metadata: string | null;
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

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  workspaceId?: string | null;
  entityType?: EntityType | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityInput {
  userId: string;
  workspaceId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
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

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
