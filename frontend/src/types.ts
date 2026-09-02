export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type Priority = "low" | "medium" | "high";
export type Severity = "critical" | "high" | "medium" | "low";
export type SeverityFilter = Severity | "all";
export type EntityType = "task" | "issue" | "subtask" | "assignment" | "workspace" | "comment" | "file" | "user";

export type NotificationType =
  | "info" | "login" | "task" | "issue" | "subtask" | "assignment"
  | "workspace" | "comment" | "file" | "success" | "warning" | "mention";

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

export interface Comment {
  id: string;
  user_id: string;
  workspace_id: string | null;
  entity_type: string;
  entity_id: string;
  body: string;
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

export type View = "dashboard" | "tasks" | "issues" | "notifications" | "workspaces" | "settings";

export type DetailTarget =
  | { kind: "task"; id: string }
  | { kind: "issue"; id: string }
  | { kind: "workspace"; id: string }
  | null;

export interface NavigationTarget {
  view: View;
  detail?: DetailTarget;
  severityFilter?: SeverityFilter;
}
