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
  invite_code?: string;
}

export type InvitationPreview =
  | {
      valid: true;
      workspace_name: string;
      workspace_id: string;
      role_name: string;
      email: string;
      invited_by_username: string;
      expires_at: string;
      invite_code: string;
    }
  | {
      valid: false;
      reason: string;
    };

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

export interface WorkspaceMembershipSummary {
  role_name: string;
  role_slug: string;
  permissions: string[];
  permission_count: number;
  is_owner: boolean;
  is_creator: boolean;
}

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  approval_flows_enabled?: number;
  owner_username?: string;
  member_count?: number;
  is_active_for_user?: boolean;
  /** Current user's membership in this workspace — not global. */
  my_membership?: WorkspaceMembershipSummary;
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
  permission_effects?: RolePermissionEffect[];
  permissions_hidden?: boolean;
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
  permissions_hidden?: boolean;
}

export interface PermissionMatrix {
  roles: WorkspaceRole[];
  permissions: Permission[];
}

export interface MyPermissions {
  workspace_id: string;
  workspace_name: string;
  permissions: string[];
  is_owner: boolean;
  is_creator: boolean;
  role_slug: string | null;
  role_name: string | null;
  approval_flows_enabled?: boolean;
  approval_decide_permissions?: string[];
  can_decide_any_approval?: boolean;
  security_version?: number;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "executed" | "failed";

export type PermissionEffect = "allow" | "approval_required" | "deny";

export interface RolePermissionEffect {
  permission_code: string;
  effect: PermissionEffect;
}

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  requester_id: string;
  approver_id: string;
  permission_code: string;
  permission_name: string;
  title: string;
  description: string;
  status: ApprovalStatus;
  resolution_note: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  attempt_number?: number;
  requester_username: string;
  requester_email: string;
}

export interface TeamMember {
  team_id: string;
  member_id: string;
  joined_at: string;
  username: string;
  email: string;
  role_name: string;
  role_slug: string;
}

export interface WorkspaceTeam {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  lead_member_id: string | null;
  created_at: string;
  updated_at: string;
  members: TeamMember[];
  lead_username: string | null;
  member_count: number;
}

export type TeamJoinStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface TeamJoinRequest {
  id: string;
  workspace_id: string;
  team_id: string;
  requester_member_id: string;
  reason: string;
  status: TeamJoinStatus;
  decided_by: string | null;
  rejection_reason: string;
  attempt_number: number;
  previous_request_id: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  requester_username: string;
  requester_email: string;
  team_name: string;
}

export interface TeamJoinStatusInfo {
  is_member: boolean;
  pending: boolean;
  last_rejected: boolean;
}

export interface TeamAssignment {
  id: string;
  workspace_id: string;
  team_id: string;
  entity_type: "task" | "issue" | "subtask";
  entity_id: string;
  assigned_by: string | null;
  created_at: string;
  team_name?: string;
}

export type ProjectStatus = "active" | "archived";
export type ProjectRoleInProject = "lead" | "member" | "reviewer";

export interface WorkspaceProject {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  lead_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  member_id: string;
  role_in_project: ProjectRoleInProject;
  status: string;
  joined_at: string;
  username: string;
  email: string;
  role_name: string;
  role_slug: string;
}

export interface ProjectTeamLink {
  project_id: string;
  team_id: string;
  team_name: string;
  member_count: number;
  assigned_at: string;
}

export interface ProjectSummary extends WorkspaceProject {
  lead_username: string | null;
  team_count: number;
  member_count: number;
  open_task_count: number;
  open_issue_count: number;
}

export interface ProjectWithDetails extends ProjectSummary {
  members: ProjectMember[];
  teams: ProjectTeamLink[];
}

export interface MemberManagementSummary {
  member_id: string;
  user_id: string;
  username: string;
  email: string;
  workspace_role_name: string;
  workspace_role_slug: string;
  is_owner: boolean;
  teams: { id: string; name: string; role_in_team: string | null; is_lead: boolean }[];
  projects: {
    id: string;
    name: string;
    role_in_project: ProjectRoleInProject | null;
    access_type: "direct" | "team";
  }[];
}

export interface WorkspaceOverviewStats {
  project_count: number;
  active_project_count: number;
  team_count: number;
  member_count: number;
  pending_approval_count: number;
  pending_team_request_count: number;
  security_alert_count: number;
}

export interface AppVersion {
  name: string;
  version: string;
}

export interface UserSession {
  id: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export type SecurityRiskLevel = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityEvent {
  id: string;
  timestamp: string;
  request_id: string | null;
  session_id: string | null;
  actor_user_id: string | null;
  workspace_id: string | null;
  team_id: string | null;
  source_ip: string | null;
  user_agent: string | null;
  http_method: string | null;
  route: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  result: string;
  reason: string | null;
  status_code: number | null;
  risk_level: SecurityRiskLevel;
  metadata: string;
}
