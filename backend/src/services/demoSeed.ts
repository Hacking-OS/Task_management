import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { addMember } from "./authorization.js";
import { ActivityLogger } from "./activityLogger.js";
import { seedDefaultRoles } from "./workspaceRoles.js";
import { seedDefaultStatuses } from "./workspaceStatuses.js";
import { getWorkspaceStorageDir } from "./workspacePaths.js";
import { notify } from "./notifications.js";
import { setMemberPermissionOverrides } from "./memberPermissions.js";
import * as teamService from "./teams.js";
import * as projectService from "./projects.js";

export const DEMO_PASSWORD = "demo1234";
export const ACME_WORKSPACE_ID = "b8492b93-0939-4b38-b4c8-70b636f2990b";
export const STARTUP_WORKSPACE_ID = "c1a2b3c4-d5e6-7890-abcd-ef1234567890";

/** Fixed invite codes for manual testing (join/onboarding flows). */
export const SEED_INVITE_CODES = {
  /** newuser@example.com → Acme Software (developer) */
  newUserAcme: "ACMEJOIN",
  /** freelancer@freelance.local → Startup Labs (developer), owner-sent to existing user */
  freelancerStartup: "FREELN01",
  /** guest@example.com → Acme Software (junior-developer), pending invite for unregistered email */
  guestAcme: "GUEST001",
} as const;

const DEMO_WORKSPACE_NAME = "Acme Software";
const STARTUP_WORKSPACE_NAME = "Startup Labs";

interface DemoUserDef {
  username: string;
  email: string;
  roleSlug?: string;
  /** If set, user belongs only to this workspace (or no workspace when omitted from all lists). */
  workspace?: "acme" | "startup" | "none";
}

const ACME_USERS: DemoUserDef[] = [
  { username: "demo", email: "demo@acme.local", roleSlug: "owner", workspace: "acme" },
  { username: "alex.admin", email: "alex.admin@acme.local", roleSlug: "admin", workspace: "acme" },
  { username: "sarah.cto", email: "sarah.cto@acme.local", roleSlug: "cto", workspace: "acme" },
  { username: "mike.em", email: "mike.em@acme.local", roleSlug: "engineering-manager", workspace: "acme" },
  { username: "jordan.lead", email: "jordan.lead@acme.local", roleSlug: "tech-lead", workspace: "acme" },
  { username: "sam.senior", email: "sam.senior@acme.local", roleSlug: "senior-developer", workspace: "acme" },
  { username: "dev.alice", email: "dev.alice@acme.local", roleSlug: "developer", workspace: "acme" },
  { username: "dev.bob", email: "dev.bob@acme.local", roleSlug: "developer", workspace: "acme" },
  { username: "dev.junior", email: "dev.junior@acme.local", roleSlug: "junior-developer", workspace: "acme" },
  { username: "qa.priya", email: "qa.priya@acme.local", roleSlug: "qa-engineer", workspace: "acme" },
  { username: "ops.ryan", email: "ops.ryan@acme.local", roleSlug: "devops-engineer", workspace: "acme" },
  { username: "pm.sarah", email: "pm.sarah@acme.local", roleSlug: "product-manager", workspace: "acme" },
  { username: "design.lee", email: "design.lee@acme.local", roleSlug: "designer", workspace: "acme" },
  { username: "scrum.anna", email: "scrum.anna@acme.local", roleSlug: "scrum-master", workspace: "acme" },
  { username: "support.tom", email: "support.tom@acme.local", roleSlug: "support-engineer", workspace: "acme" },
  { username: "freelancer", email: "freelancer@freelance.local", roleSlug: "developer", workspace: "acme" },
];

const STANDALONE_USERS: DemoUserDef[] = [
  { username: "startup", email: "startup@labs.local", roleSlug: "owner", workspace: "startup" },
  { username: "newuser", email: "newuser@example.com", workspace: "none" },
  { username: "orphan", email: "orphan@example.com", workspace: "none" },
];

function ensureUser(username: string, email: string): string {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  db.prepare("INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").run(
    id,
    username,
    email,
    hash
  );
  return id;
}

function insertInvitation(input: {
  id: string;
  workspaceId: string;
  email: string;
  invitedBy: string;
  roleId: string;
  token: string;
  inviteCode: string;
  expiresInDays?: number;
  status?: "pending" | "accepted" | "rejected" | "revoked" | "expired";
}): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + (input.expiresInDays ?? 7));
  db.prepare(`
    INSERT INTO workspace_invitations (
      id, workspace_id, email, invited_by, role_id, status, token, invite_code, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.workspaceId,
    input.email.toLowerCase(),
    input.invitedBy,
    input.roleId,
    input.status ?? "pending",
    input.token,
    input.inviteCode,
    expires.toISOString()
  );
}

function seedWorkspace(
  wsId: string,
  ownerId: string,
  name: string,
  description: string
): Record<string, { id: string }> {
  getWorkspaceStorageDir(wsId);
  db.prepare(`
    INSERT INTO workspaces (id, user_id, name, description, is_active, approval_flows_enabled)
    VALUES (?, ?, ?, ?, 0, 1)
  `).run(wsId, ownerId, name, description);

  const roles = seedDefaultRoles(wsId);
  seedDefaultStatuses(wsId);
  return roles;
}

function seedAcmeTeams(ownerId: string, wsId: string, memberIds: Record<string, string>): void {
  const platformTeam = teamService.createTeam(ownerId, wsId, {
    name: "Platform Engineering",
    description: "Core platform, APIs, and infrastructure code.",
    lead_member_id: memberIds["jordan.lead"],
  });
  const productTeam = teamService.createTeam(ownerId, wsId, {
    name: "Product Squad",
    description: "Feature delivery and product backlog.",
    lead_member_id: memberIds["pm.sarah"],
  });
  const qaTeam = teamService.createTeam(ownerId, wsId, {
    name: "QA & Release",
    description: "Quality assurance and release validation.",
    lead_member_id: memberIds["qa.priya"],
  });
  const devopsTeam = teamService.createTeam(ownerId, wsId, {
    name: "DevOps",
    description: "CI/CD, monitoring, and deployment.",
    lead_member_id: memberIds["ops.ryan"],
  });
  const supportTeam = teamService.createTeam(ownerId, wsId, {
    name: "Customer Support",
    description: "Customer-reported issues and escalations.",
    lead_member_id: memberIds["support.tom"],
  });

  for (const username of ["sam.senior", "dev.alice", "dev.bob", "dev.junior", "freelancer"]) {
    teamService.addTeamMember(ownerId, wsId, platformTeam.id, memberIds[username]);
  }
  for (const username of ["design.lee", "scrum.anna"]) {
    teamService.addTeamMember(ownerId, wsId, productTeam.id, memberIds[username]);
  }
  teamService.addTeamMember(ownerId, wsId, qaTeam.id, memberIds["dev.alice"]);
  teamService.addTeamMember(ownerId, wsId, devopsTeam.id, memberIds["ops.ryan"]);
  teamService.addTeamMember(ownerId, wsId, supportTeam.id, memberIds["support.tom"]);
}

function seedAcmeProjects(ownerId: string, wsId: string, memberIds: Record<string, string>): void {
  const teamId = (name: string) =>
    (db.prepare("SELECT id FROM workspace_teams WHERE workspace_id = ? AND name = ?").get(wsId, name) as { id: string }).id;

  const crm = projectService.createProject(ownerId, wsId, {
    name: "CRM Platform",
    description: "Customer relationship management and sales pipeline.",
    lead_member_id: memberIds["pm.sarah"],
  });
  projectService.setProjectTeams(ownerId, wsId, crm.id, [teamId("Platform Engineering"), teamId("Product Squad")]);
  projectService.addProjectMember(ownerId, wsId, crm.id, memberIds["design.lee"], "member");

  const tms = projectService.createProject(ownerId, wsId, {
    name: "Task Management SaaS",
    description: "Core task, issue, and workspace collaboration product.",
    lead_member_id: memberIds["jordan.lead"],
  });
  projectService.setProjectTeams(ownerId, wsId, tms.id, [
    teamId("Platform Engineering"),
    teamId("QA & Release"),
    teamId("DevOps"),
  ]);
  projectService.addProjectMember(ownerId, wsId, tms.id, memberIds["pm.sarah"], "reviewer");

  const portal = projectService.createProject(ownerId, wsId, {
    name: "Internal Portal",
    description: "Employee self-service and internal tools.",
    lead_member_id: memberIds["mike.em"],
  });
  projectService.setProjectTeams(ownerId, wsId, portal.id, [teamId("DevOps"), teamId("Product Squad")]);

  const ecommerce = projectService.createProject(ownerId, wsId, {
    name: "E-commerce",
    description: "Online storefront and checkout experience.",
    lead_member_id: memberIds["dev.alice"],
  });
  projectService.setProjectTeams(ownerId, wsId, ecommerce.id, [teamId("Platform Engineering"), teamId("Customer Support")]);
  projectService.addProjectMember(ownerId, wsId, ecommerce.id, memberIds["freelancer"], "member");
}

function backfillAcmeProjectsIfMissing(): void {
  const ws = db.prepare(`
    SELECT id, user_id FROM workspaces WHERE name = ?
  `).get(DEMO_WORKSPACE_NAME) as { id: string; user_id: string } | undefined;
  if (!ws) return;

  const { c } = db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_projects WHERE workspace_id = ?
  `).get(ws.id) as { c: number };
  if (c > 0) return;

  const teamCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_teams WHERE workspace_id = ?
  `).get(ws.id) as { c: number }).c;
  if (teamCount === 0) return;

  const rows = db.prepare(`
    SELECT m.id, u.username FROM workspace_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ?
  `).all(ws.id) as { id: string; username: string }[];

  const memberIds: Record<string, string> = {};
  for (const row of rows) memberIds[row.username] = row.id;
  seedAcmeProjects(ws.user_id, ws.id, memberIds);
}

function seedWorkItems(
  wsId: string,
  userIds: Record<string, string>
): { taskIds: string[]; issueIds: string[] } {
  const taskDefs = [
    { title: "Implement workspace RBAC API", status: "in_progress", priority: "high", severity: "high", assignee: "dev.alice", creator: "jordan.lead" },
    { title: "Add team management endpoints", status: "in_progress", priority: "high", severity: "critical", assignee: "sam.senior", creator: "jordan.lead" },
    { title: "Design permission matrix UI", status: "todo", priority: "medium", severity: "medium", assignee: "design.lee", creator: "pm.sarah" },
    { title: "Set up CI pipeline for backend", status: "in_progress", priority: "high", severity: "high", assignee: "ops.ryan", creator: "mike.em" },
    { title: "Write integration tests for tasks API", status: "todo", priority: "medium", severity: "medium", assignee: "qa.priya", creator: "jordan.lead" },
    { title: "Onboard junior developer", status: "done", priority: "low", severity: "low", assignee: "dev.junior", creator: "jordan.lead" },
    { title: "Sprint planning Q3", status: "done", priority: "medium", severity: "low", assignee: "scrum.anna", creator: "pm.sarah" },
    { title: "Refactor notification service", status: "todo", priority: "medium", severity: "medium", assignee: "dev.bob", creator: "sam.senior" },
    { title: "Workspace invite onboarding flow", status: "in_progress", priority: "high", severity: "high", assignee: "freelancer", creator: "demo" },
    { title: "Member permission override editor", status: "todo", priority: "high", severity: "medium", assignee: "alex.admin", creator: "demo" },
    { title: "Activity log pagination", status: "todo", priority: "low", severity: "low", assignee: "dev.bob", creator: "pm.sarah" },
    { title: "Timesheet export CSV", status: "in_progress", priority: "medium", severity: "medium", assignee: "ops.ryan", creator: "mike.em" },
    { title: "Socket reconnect on tab focus", status: "todo", priority: "medium", severity: "medium", assignee: "sam.senior", creator: "jordan.lead" },
    { title: "Mobile nav polish", status: "in_progress", priority: "low", severity: "low", assignee: "design.lee", creator: "pm.sarah" },
    { title: "Approval flow notifications", status: "todo", priority: "medium", severity: "medium", assignee: "alex.admin", creator: "demo" },
  ];

  const taskIds: string[] = [];
  for (const t of taskDefs) {
    const id = crypto.randomUUID();
    taskIds.push(id);
    db.prepare(`
      INSERT INTO tasks (id, user_id, workspace_id, assignee_id, title, description, status, priority, severity, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '+14 days'))
    `).run(
      id,
      userIds[t.creator],
      wsId,
      userIds[t.assignee],
      t.title,
      `${t.title} — tracked in ${DEMO_WORKSPACE_NAME}.`,
      t.status,
      t.priority,
      t.severity
    );
    ActivityLogger.log({
      userId: userIds[t.creator],
      workspaceId: wsId,
      entityType: "task",
      entityId: id,
      action: "created",
      description: `Task "${t.title}" was created`,
      metadata: { assignee: t.assignee, severity: t.severity },
    });
  }

  const issueDefs = [
    { title: "Login timeout on slow networks", status: "open", priority: "high", severity: "critical", assignee: "dev.alice", creator: "support.tom" },
    { title: "Dashboard charts not rendering in Safari", status: "in_progress", priority: "medium", severity: "high", assignee: "dev.bob", creator: "qa.priya" },
    { title: "Permission denied after role change", status: "open", priority: "high", severity: "high", assignee: "sam.senior", creator: "alex.admin" },
    { title: "Export CSV missing assignee column", status: "resolved", priority: "low", severity: "medium", assignee: "dev.alice", creator: "pm.sarah" },
    { title: "Mobile layout overlap on tasks page", status: "in_progress", priority: "medium", severity: "medium", assignee: "design.lee", creator: "qa.priya" },
    { title: "Invite code rejected for existing member", status: "open", priority: "high", severity: "high", assignee: "freelancer", creator: "demo" },
    { title: "Notification bell duplicate entries", status: "open", priority: "medium", severity: "medium", assignee: "dev.bob", creator: "qa.priya" },
    { title: "Workspace switcher stale after accept", status: "in_progress", priority: "high", severity: "high", assignee: "sam.senior", creator: "jordan.lead" },
    { title: "Timesheet hours rounded incorrectly", status: "open", priority: "low", severity: "low", assignee: "ops.ryan", creator: "mike.em" },
    { title: "Owner hidden from permissions table", status: "resolved", priority: "medium", severity: "low", assignee: "alex.admin", creator: "demo" },
  ];

  const issueIds: string[] = [];
  for (const i of issueDefs) {
    const id = crypto.randomUUID();
    issueIds.push(id);
    db.prepare(`
      INSERT INTO issues (id, user_id, workspace_id, assignee_id, title, description, status, priority, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userIds[i.creator],
      wsId,
      userIds[i.assignee],
      i.title,
      `Reported issue: ${i.title}`,
      i.status,
      i.priority,
      i.severity
    );
    ActivityLogger.log({
      userId: userIds[i.creator],
      workspaceId: wsId,
      entityType: "issue",
      entityId: id,
      action: "created",
      description: `Issue "${i.title}" was opened`,
      metadata: { severity: i.severity },
    });
  }

  const subtaskDefs = [
    { title: "Add middleware tests", taskIdx: 0, assignee: "dev.junior", creator: "jordan.lead", status: "todo" },
    { title: "Document RBAC endpoints", taskIdx: 0, assignee: "dev.alice", creator: "jordan.lead", status: "done" },
    { title: "Create team CRUD routes", taskIdx: 1, assignee: "sam.senior", creator: "jordan.lead", status: "in_progress" },
    { title: "Seed demo users script", taskIdx: 1, assignee: "dev.bob", creator: "sam.senior", status: "done" },
    { title: "Configure GitHub Actions", taskIdx: 3, assignee: "ops.ryan", creator: "ops.ryan", status: "todo" },
    { title: "Add Docker compose for dev", taskIdx: 3, assignee: "ops.ryan", creator: "mike.em", status: "done" },
    { title: "Reproduce Safari bug", issueIdx: 1, assignee: "qa.priya", creator: "qa.priya", status: "done" },
    { title: "Fix flex layout on mobile", issueIdx: 4, assignee: "dev.bob", creator: "design.lee", status: "todo" },
    { title: "Verify role cache invalidation", issueIdx: 2, assignee: "sam.senior", creator: "alex.admin", status: "in_progress" },
    { title: "Update customer FAQ", issueIdx: 0, assignee: "support.tom", creator: "support.tom", status: "todo" },
    { title: "Validate owner-only invite API", taskIdx: 8, assignee: "freelancer", creator: "demo", status: "in_progress" },
    { title: "Test onboarding redirect", taskIdx: 8, assignee: "qa.priya", creator: "freelancer", status: "todo" },
    { title: "Add pending invite notification", issueIdx: 5, assignee: "dev.alice", creator: "demo", status: "open" },
    { title: "Regression test permissions page", issueIdx: 9, assignee: "qa.priya", creator: "alex.admin", status: "done" },
    { title: "Log hours on RBAC task", taskIdx: 0, assignee: "dev.alice", creator: "dev.alice", status: "in_progress" },
  ];

  for (const s of subtaskDefs) {
    const id = crypto.randomUUID();
    const taskId = s.taskIdx !== undefined ? taskIds[s.taskIdx] : null;
    const issueId = s.issueIdx !== undefined ? issueIds[s.issueIdx] : null;
    db.prepare(`
      INSERT INTO subtasks (id, user_id, task_id, issue_id, workspace_id, title, status, assignee_id, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'medium')
    `).run(
      id,
      userIds[s.creator],
      taskId,
      issueId,
      wsId,
      s.title,
      s.status,
      userIds[s.assignee]
    );
  }

  return { taskIds, issueIds };
}

function seedCommentsAndTime(
  wsId: string,
  userIds: Record<string, string>,
  taskIds: string[],
  issueIds: string[]
): void {
  const comments = [
    { entityType: "task", entityId: taskIds[0], user: "jordan.lead", body: "Please cover owner-only invite routes in tests." },
    { entityType: "task", entityId: taskIds[0], user: "dev.alice", body: "Working on middleware — will push a draft PR today." },
    { entityType: "task", entityId: taskIds[8], user: "demo", body: "This flow should block random invite codes for users with workspaces." },
    { entityType: "issue", entityId: issueIds[0], user: "support.tom", body: "Customer reports 30s timeout on 3G connections." },
    { entityType: "issue", entityId: issueIds[5], user: "freelancer", body: "Reproduced with freelancer account — needs owner-sent invite." },
    { entityType: "issue", entityId: issueIds[2], user: "alex.admin", body: "Likely stale permission cache after role change." },
  ];

  for (const c of comments) {
    db.prepare(`
      INSERT INTO comments (id, user_id, workspace_id, entity_type, entity_id, body)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), userIds[c.user], wsId, c.entityType, c.entityId, c.body);
  }

  const timeEntries = [
    { user: "dev.alice", entityType: "task", entityId: taskIds[0], hours: 3.5, description: "RBAC middleware" },
    { user: "dev.alice", entityType: "task", entityId: taskIds[0], hours: 2, description: "Route tests", daysAgo: 1 },
    { user: "sam.senior", entityType: "task", entityId: taskIds[1], hours: 4, description: "Team endpoints" },
    { user: "freelancer", entityType: "task", entityId: taskIds[8], hours: 5, description: "Onboarding UI wiring" },
    { user: "qa.priya", entityType: "issue", entityId: issueIds[1], hours: 1.5, description: "Safari repro" },
    { user: "ops.ryan", entityType: "task", entityId: taskIds[3], hours: 6, description: "CI pipeline setup" },
  ];

  for (const entry of timeEntries) {
    const workDate = new Date();
    workDate.setDate(workDate.getDate() - (entry.daysAgo ?? 0));
    db.prepare(`
      INSERT INTO time_entries (id, user_id, workspace_id, entity_type, entity_id, work_date, hours, description)
      VALUES (?, ?, ?, ?, ?, date(?), ?, ?)
    `).run(
      crypto.randomUUID(),
      userIds[entry.user],
      wsId,
      entry.entityType,
      entry.entityId,
      workDate.toISOString().slice(0, 10),
      entry.hours,
      entry.description
    );
  }
}

function seedInvitations(
  acmeId: string,
  startupId: string,
  userIds: Record<string, string>,
  acmeRoles: Record<string, { id: string }>,
  startupRoles: Record<string, { id: string }>
): void {
  insertInvitation({
    id: "11111111-1111-4111-8111-111111111101",
    workspaceId: acmeId,
    email: "newuser@example.com",
    invitedBy: userIds.demo,
    roleId: acmeRoles.developer.id,
    token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    inviteCode: SEED_INVITE_CODES.newUserAcme,
  });

  insertInvitation({
    id: "11111111-1111-4111-8111-111111111102",
    workspaceId: startupId,
    email: "freelancer@freelance.local",
    invitedBy: userIds.startup,
    roleId: startupRoles.developer.id,
    token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    inviteCode: SEED_INVITE_CODES.freelancerStartup,
  });

  insertInvitation({
    id: "11111111-1111-4111-8111-111111111103",
    workspaceId: acmeId,
    email: "guest@example.com",
    invitedBy: userIds.demo,
    roleId: acmeRoles["junior-developer"].id,
    token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    inviteCode: SEED_INVITE_CODES.guestAcme,
  });

  insertInvitation({
    id: "11111111-1111-4111-8111-111111111104",
    workspaceId: acmeId,
    email: "expired@example.com",
    invitedBy: userIds.demo,
    roleId: acmeRoles.developer.id,
    token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    inviteCode: "EXPIRED1",
    expiresInDays: -2,
    status: "pending",
  });
  db.prepare(`
    UPDATE workspace_invitations SET expires_at = datetime('now', '-2 days') WHERE id = ?
  `).run("11111111-1111-4111-8111-111111111104");

  insertInvitation({
    id: "11111111-1111-4111-8111-111111111105",
    workspaceId: acmeId,
    email: "revoked@example.com",
    invitedBy: userIds.demo,
    roleId: acmeRoles.developer.id,
    token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    inviteCode: "REVOKED1",
    status: "revoked",
  });

  notify({
    userId: userIds.freelancer,
    type: "invite",
    title: "Workspace invitation",
    message: `You were invited to join "${STARTUP_WORKSPACE_NAME}" as Developer.`,
    workspaceId: startupId,
    entityType: "workspace",
    entityId: startupId,
    metadata: {
      action: "workspace_invite",
      invitation_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      invitation_code: SEED_INVITE_CODES.freelancerStartup,
      invitation_id: "11111111-1111-4111-8111-111111111102",
      role_name: "Developer",
      workspace_name: STARTUP_WORKSPACE_NAME,
    },
  });

  notify({
    userId: userIds["dev.junior"],
    type: "task",
    title: "Task assigned",
    message: 'You were assigned "Onboard junior developer".',
    workspaceId: acmeId,
    entityType: "task",
    entityId: "seed-notification-task",
  });

  notify({
    userId: userIds["alex.admin"],
    type: "workspace",
    title: "Approval request",
    message: "dev.junior requested permission: member.view",
    workspaceId: acmeId,
    entityType: "workspace",
    entityId: acmeId,
  });
}

function seedApprovalRequests(acmeId: string, userIds: Record<string, string>): void {
  db.prepare(`
    INSERT INTO approval_requests (
      id, workspace_id, requester_id, approver_id, permission_code, title, description, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    "22222222-2222-4222-8222-222222222201",
    acmeId,
    userIds["dev.junior"],
    userIds.demo,
    "member.view",
    "Access request: member.view",
    "Need to view member list for onboarding documentation.",
  );

  db.prepare(`
    INSERT INTO approval_requests (
      id, workspace_id, requester_id, approver_id, permission_code, title, description, status, resolution_note, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, datetime('now', '-1 day'))
  `).run(
    "22222222-2222-4222-8222-222222222202",
    acmeId,
    userIds["support.tom"],
    userIds.demo,
    "task.create",
    "Access request: task.create",
    "Support engineer creating customer follow-up tasks.",
    "Approved for support workflow.",
  );
}

export function seedDemoData(): void {
  const existingWs = db.prepare("SELECT id FROM workspaces WHERE name = ?").get(DEMO_WORKSPACE_NAME) as
    | { id: string }
    | undefined;
  if (existingWs) {
    backfillAcmeProjectsIfMissing();
    return;
  }

  const userIds: Record<string, string> = {};
  for (const u of [...ACME_USERS, ...STANDALONE_USERS]) {
    userIds[u.username] = ensureUser(u.username, u.email);
  }

  const ownerId = userIds.demo;
  const acmeRoles = seedWorkspace(
    ACME_WORKSPACE_ID,
    ownerId,
    DEMO_WORKSPACE_NAME,
    "Demo software company workspace with teams, roles, invites, and sample work items."
  );

  db.prepare("UPDATE workspaces SET is_active = 1 WHERE id = ?").run(ACME_WORKSPACE_ID);
  db.prepare("UPDATE workspaces SET is_active = 0 WHERE user_id = ? AND id != ?").run(ownerId, ACME_WORKSPACE_ID);

  const memberIds: Record<string, string> = {};
  for (const u of ACME_USERS) {
    if (!u.roleSlug) continue;
    const role = acmeRoles[u.roleSlug];
    if (!role) continue;
    const member = addMember(ACME_WORKSPACE_ID, userIds[u.username], role.id);
    memberIds[u.username] = member.id;
  }

  setMemberPermissionOverrides(ACME_WORKSPACE_ID, memberIds["dev.junior"], [
    { permission_code: "task.edit", effect: "grant" },
    { permission_code: "issue.create", effect: "deny" },
  ]);

  seedAcmeTeams(ownerId, ACME_WORKSPACE_ID, memberIds);
  seedAcmeProjects(ownerId, ACME_WORKSPACE_ID, memberIds);
  const { taskIds, issueIds } = seedWorkItems(ACME_WORKSPACE_ID, userIds);
  seedCommentsAndTime(ACME_WORKSPACE_ID, userIds, taskIds, issueIds);

  const startupOwnerId = userIds.startup;
  const startupRoles = seedWorkspace(
    STARTUP_WORKSPACE_ID,
    startupOwnerId,
    STARTUP_WORKSPACE_NAME,
    "Second workspace for multi-workspace and owner-invite testing."
  );
  addMember(STARTUP_WORKSPACE_ID, startupOwnerId, startupRoles.owner.id);
  db.prepare("UPDATE workspaces SET is_active = 1 WHERE id = ? AND user_id = ?").run(
    STARTUP_WORKSPACE_ID,
    startupOwnerId
  );

  seedInvitations(ACME_WORKSPACE_ID, STARTUP_WORKSPACE_ID, userIds, acmeRoles, startupRoles);
  seedApprovalRequests(ACME_WORKSPACE_ID, userIds);

  ActivityLogger.log({
    userId: ownerId,
    workspaceId: ACME_WORKSPACE_ID,
    entityType: "workspace",
    entityId: ACME_WORKSPACE_ID,
    action: "demo_seeded",
    description: "Demo workspace seeded with users, teams, tasks, issues, invites, and approvals",
    metadata: {
      acme_workspace_id: ACME_WORKSPACE_ID,
      startup_workspace_id: STARTUP_WORKSPACE_ID,
      users: ACME_USERS.length + STANDALONE_USERS.length,
      tasks: 15,
      issues: 10,
      invite_codes: SEED_INVITE_CODES,
    },
  });

  console.log(`
Demo data seeded (password for all users: ${DEMO_PASSWORD})

Acme Software (${ACME_WORKSPACE_ID})
  Owner login: demo / ${DEMO_PASSWORD}

Onboarding / invite test accounts:
  newuser / ${DEMO_PASSWORD}  — no workspace, pending Acme invite (code: ${SEED_INVITE_CODES.newUserAcme})
  orphan  / ${DEMO_PASSWORD}  — no workspace, no invites (create workspace flow)
  freelancer / ${DEMO_PASSWORD} — Acme member + pending Startup Labs owner invite (code: ${SEED_INVITE_CODES.freelancerStartup})

Second workspace:
  startup / ${DEMO_PASSWORD} — Startup Labs owner (${STARTUP_WORKSPACE_ID})
`);
}
