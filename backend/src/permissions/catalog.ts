export interface PermissionDefinition {
  code: string;
  name: string;
  description: string;
  group: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Workspace
  { code: "workspace.view", name: "View Workspace", description: "View workspace details and overview", group: "Workspace" },
  { code: "workspace.edit", name: "Edit Workspace", description: "Edit workspace name and description", group: "Workspace" },
  { code: "workspace.delete", name: "Delete Workspace", description: "Permanently delete the workspace", group: "Workspace" },
  { code: "workspace.settings", name: "Manage Settings", description: "Change workspace settings", group: "Workspace" },
  { code: "workspace.manage_members", name: "Manage Members", description: "Invite and remove workspace members", group: "Workspace" },
  { code: "workspace.manage_roles", name: "Manage Roles", description: "Create and edit workspace roles", group: "Workspace" },
  { code: "workspace.manage_permissions", name: "Manage Permissions", description: "Customize role permissions", group: "Workspace" },

  // Teams
  { code: "team.view", name: "View Teams", description: "View workspace teams", group: "Teams" },
  { code: "team.create", name: "Create Teams", description: "Create new teams", group: "Teams" },
  { code: "team.edit", name: "Edit Teams", description: "Edit team details", group: "Teams" },
  { code: "team.delete", name: "Delete Teams", description: "Delete teams", group: "Teams" },
  { code: "team.manage_members", name: "Manage Team Members", description: "Add or remove members from teams", group: "Teams" },
  { code: "team.assign_lead", name: "Assign Team Lead", description: "Set or change team lead", group: "Teams" },

  // Tasks
  { code: "task.view", name: "View Tasks", description: "View tasks in the workspace", group: "Tasks" },
  { code: "task.create", name: "Create Tasks", description: "Create new tasks", group: "Tasks" },
  { code: "task.edit", name: "Edit Tasks", description: "Edit task details", group: "Tasks" },
  { code: "task.delete", name: "Delete Tasks", description: "Delete tasks", group: "Tasks" },
  { code: "task.assign", name: "Assign Tasks", description: "Assign tasks to members", group: "Tasks" },
  { code: "task.change_status", name: "Change Task Status", description: "Update task status", group: "Tasks" },
  { code: "task.change_severity", name: "Change Task Severity", description: "Update task severity", group: "Tasks" },
  { code: "task.change_priority", name: "Change Task Priority", description: "Update task priority", group: "Tasks" },
  { code: "task.add_comment", name: "Comment on Tasks", description: "Add comments to tasks", group: "Tasks" },

  // Issues
  { code: "issue.view", name: "View Issues", description: "View issues in the workspace", group: "Issues" },
  { code: "issue.create", name: "Create Issues", description: "Create new issues", group: "Issues" },
  { code: "issue.edit", name: "Edit Issues", description: "Edit issue details", group: "Issues" },
  { code: "issue.delete", name: "Delete Issues", description: "Delete issues", group: "Issues" },
  { code: "issue.assign", name: "Assign Issues", description: "Assign issues to members", group: "Issues" },
  { code: "issue.change_status", name: "Change Issue Status", description: "Update issue status", group: "Issues" },
  { code: "issue.change_severity", name: "Change Issue Severity", description: "Update issue severity", group: "Issues" },
  { code: "issue.add_comment", name: "Comment on Issues", description: "Add comments to issues", group: "Issues" },

  // Subtasks
  { code: "subtask.view", name: "View Subtasks", description: "View subtasks", group: "Subtasks" },
  { code: "subtask.create", name: "Create Subtasks", description: "Create subtasks", group: "Subtasks" },
  { code: "subtask.edit", name: "Edit Subtasks", description: "Edit subtask details", group: "Subtasks" },
  { code: "subtask.delete", name: "Delete Subtasks", description: "Delete subtasks", group: "Subtasks" },
  { code: "subtask.assign", name: "Assign Subtasks", description: "Assign subtasks to members", group: "Subtasks" },
  { code: "subtask.change_status", name: "Change Subtask Status", description: "Update subtask status", group: "Subtasks" },
  { code: "subtask.change_severity", name: "Change Subtask Severity", description: "Update subtask severity", group: "Subtasks" },

  // Files
  { code: "file.view", name: "View Files", description: "Browse workspace files", group: "Files" },
  { code: "file.upload", name: "Upload Files", description: "Upload files to workspace", group: "Files" },
  { code: "file.download", name: "Download Files", description: "Download workspace files", group: "Files" },
  { code: "file.rename", name: "Rename Files", description: "Rename workspace files", group: "Files" },
  { code: "file.delete", name: "Delete Files", description: "Delete workspace files", group: "Files" },

  // Collaboration
  { code: "comment.view", name: "View Comments", description: "View comments", group: "Collaboration" },
  { code: "comment.create", name: "Create Comments", description: "Post comments", group: "Collaboration" },
  { code: "comment.edit", name: "Edit Comments", description: "Edit own comments", group: "Collaboration" },
  { code: "comment.delete", name: "Delete Comments", description: "Delete comments", group: "Collaboration" },
  { code: "activity.view", name: "View Activity", description: "View workspace activity logs", group: "Collaboration" },
  { code: "notification.view", name: "View Notifications", description: "View notifications", group: "Collaboration" },
  { code: "notification.manage", name: "Manage Notifications", description: "Mark read and dismiss notifications", group: "Collaboration" },

  // Timesheets
  { code: "timesheet.view", name: "View Timesheets", description: "View own time entries", group: "Timesheets" },
  { code: "timesheet.view_all", name: "View All Timesheets", description: "View all workspace time entries", group: "Timesheets" },
  { code: "timesheet.create", name: "Log Time", description: "Create time entries", group: "Timesheets" },
  { code: "timesheet.edit", name: "Edit Timesheets", description: "Edit time entries", group: "Timesheets" },
  { code: "timesheet.delete", name: "Delete Timesheets", description: "Delete time entries", group: "Timesheets" },

  // Members
  { code: "member.view", name: "View Members", description: "View workspace members", group: "Members" },
  { code: "member.invite", name: "Invite Members", description: "Send workspace invitations", group: "Members" },
  { code: "member.remove", name: "Remove Members", description: "Remove members from workspace", group: "Members" },
  { code: "member.change_role", name: "Change Member Role", description: "Change a member's role", group: "Members" },
];

export const ALL_PERMISSION_CODES = PERMISSION_CATALOG.map((p) => p.code);

const V = ALL_PERMISSION_CODES;
const omit = (...codes: string[]) => V.filter((p) => !codes.includes(p));

const BASE = [
  "workspace.view", "task.view", "issue.view", "subtask.view", "file.view", "file.download",
  "comment.view", "activity.view", "notification.view", "notification.manage", "member.view", "team.view",
  "timesheet.view", "timesheet.create", "timesheet.edit",
];

const ENGINEER = [
  ...BASE,
  "task.create", "task.edit", "task.change_status", "task.change_severity", "task.change_priority", "task.add_comment",
  "issue.create", "issue.edit", "issue.change_status", "issue.change_severity", "issue.add_comment",
  "subtask.create", "subtask.edit", "subtask.change_status", "subtask.change_severity",
  "file.upload", "comment.create",
];

const TEAM_LEAD = [
  ...ENGINEER,
  "task.assign", "issue.assign", "subtask.assign", "team.manage_members",
];

const MANAGER = [
  ...TEAM_LEAD,
  "workspace.edit", "workspace.manage_members", "member.invite", "member.change_role",
  "team.create", "team.edit", "team.assign_lead",
  "task.delete", "issue.delete", "subtask.delete",
  "workspace.settings",
  "timesheet.view_all", "timesheet.delete",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ALL_PERMISSION_CODES,
  admin: omit("workspace.delete", "workspace.manage_permissions"),
  cto: omit("workspace.delete", "workspace.manage_permissions", "workspace.manage_roles"),
  "engineering-manager": MANAGER,
  "tech-lead": TEAM_LEAD,
  "senior-developer": [...ENGINEER, "task.assign", "subtask.assign"],
  developer: ENGINEER,
  "junior-developer": ENGINEER.filter((p) => !p.includes(".delete")),
  "qa-engineer": [
    ...BASE,
    "issue.create", "issue.edit", "issue.change_status", "issue.change_severity", "issue.add_comment", "issue.assign",
    "task.edit", "task.change_status", "task.add_comment",
    "subtask.edit", "subtask.change_status",
    "comment.create",
  ],
  "devops-engineer": [
    ...ENGINEER,
    "file.delete", "file.rename", "task.assign", "issue.assign",
    "team.manage_members",
  ],
  "product-manager": [
    ...BASE,
    "task.create", "task.edit", "task.change_status", "task.change_priority", "task.assign", "task.add_comment",
    "issue.create", "issue.edit", "issue.change_status", "issue.change_severity", "issue.assign", "issue.add_comment",
    "subtask.view", "subtask.create", "comment.create",
    "team.view",
  ],
  designer: [
    ...BASE,
    "issue.create", "issue.edit", "issue.add_comment", "task.add_comment", "comment.create",
  ],
  "scrum-master": [
    ...BASE,
    "task.edit", "task.change_status", "task.assign", "task.add_comment",
    "issue.edit", "issue.change_status", "issue.assign", "issue.add_comment",
    "subtask.edit", "subtask.change_status", "subtask.assign",
    "team.view", "team.manage_members", "comment.create",
  ],
  "support-engineer": [
    ...BASE,
    "issue.create", "issue.edit", "issue.change_status", "issue.add_comment",
    "task.add_comment", "comment.create",
  ],
  viewer: BASE.filter((p) => !p.startsWith("team.") || p === "team.view"),
};

export const SYSTEM_ROLE_SLUGS = [
  "owner",
  "admin",
  "cto",
  "engineering-manager",
  "tech-lead",
  "senior-developer",
  "developer",
  "junior-developer",
  "qa-engineer",
  "devops-engineer",
  "product-manager",
  "designer",
  "scrum-master",
  "support-engineer",
  "viewer",
] as const;

export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number];

export const SYSTEM_ROLE_NAMES: Record<SystemRoleSlug, string> = {
  owner: "Owner",
  admin: "Admin",
  cto: "CTO",
  "engineering-manager": "Engineering Manager",
  "tech-lead": "Tech Lead",
  "senior-developer": "Senior Developer",
  developer: "Developer",
  "junior-developer": "Junior Developer",
  "qa-engineer": "QA Engineer",
  "devops-engineer": "DevOps Engineer",
  "product-manager": "Product Manager",
  designer: "Designer",
  "scrum-master": "Scrum Master",
  "support-engineer": "Support Engineer",
  viewer: "Viewer",
};

/** Legacy slugs mapped when migrating old workspaces. */
export const LEGACY_ROLE_SLUG_MAP: Record<string, SystemRoleSlug> = {
  member: "developer",
};
