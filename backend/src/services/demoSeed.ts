import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { addMember } from "./authorization.js";
import { ActivityLogger } from "./activityLogger.js";
import { seedDefaultRoles } from "./workspaceRoles.js";
import { seedDefaultStatuses } from "./workspaceStatuses.js";
import { getWorkspaceStorageDir } from "./workspacePaths.js";
import * as teamService from "./teams.js";

const DEMO_PASSWORD = "demo1234";
const DEMO_WORKSPACE_NAME = "Acme Software";

interface DemoUserDef {
  username: string;
  email: string;
  roleSlug: string;
}

const DEMO_USERS: DemoUserDef[] = [
  { username: "demo", email: "demo@acme.local", roleSlug: "owner" },
  { username: "alex.admin", email: "alex.admin@acme.local", roleSlug: "admin" },
  { username: "sarah.cto", email: "sarah.cto@acme.local", roleSlug: "cto" },
  { username: "mike.em", email: "mike.em@acme.local", roleSlug: "engineering-manager" },
  { username: "jordan.lead", email: "jordan.lead@acme.local", roleSlug: "tech-lead" },
  { username: "sam.senior", email: "sam.senior@acme.local", roleSlug: "senior-developer" },
  { username: "dev.alice", email: "dev.alice@acme.local", roleSlug: "developer" },
  { username: "dev.bob", email: "dev.bob@acme.local", roleSlug: "developer" },
  { username: "dev.junior", email: "dev.junior@acme.local", roleSlug: "junior-developer" },
  { username: "qa.priya", email: "qa.priya@acme.local", roleSlug: "qa-engineer" },
  { username: "ops.ryan", email: "ops.ryan@acme.local", roleSlug: "devops-engineer" },
  { username: "pm.sarah", email: "pm.sarah@acme.local", roleSlug: "product-manager" },
  { username: "design.lee", email: "design.lee@acme.local", roleSlug: "designer" },
  { username: "scrum.anna", email: "scrum.anna@acme.local", roleSlug: "scrum-master" },
  { username: "support.tom", email: "support.tom@acme.local", roleSlug: "support-engineer" },
];

function ensureUser(username: string, email: string): string {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  db.prepare(
    "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)"
  ).run(id, username, email, hash);
  return id;
}

export function seedDemoData(): void {
  const existingWs = db.prepare("SELECT id FROM workspaces WHERE name = ?").get(DEMO_WORKSPACE_NAME) as { id: string } | undefined;
  if (existingWs) return;

  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    userIds[u.username] = ensureUser(u.username, u.email);
  }

  const ownerId = userIds.demo;
  const wsId = crypto.randomUUID();
  getWorkspaceStorageDir(wsId);

  db.prepare(`
    INSERT INTO workspaces (id, user_id, name, description, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    wsId,
    ownerId,
    DEMO_WORKSPACE_NAME,
    "Demo software company workspace with teams, roles, and sample work items."
  );

  db.prepare("UPDATE workspaces SET is_active = 0 WHERE user_id = ? AND id != ?").run(ownerId, wsId);

  const roles = seedDefaultRoles(wsId);
  seedDefaultStatuses(wsId);

  const memberIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const role = roles[u.roleSlug];
    if (!role) continue;
    const member = addMember(wsId, userIds[u.username], role.id);
    memberIds[u.username] = member.id;
  }

  // Teams
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

  for (const username of ["sam.senior", "dev.alice", "dev.bob", "dev.junior"]) {
    teamService.addTeamMember(ownerId, wsId, platformTeam.id, memberIds[username]);
  }
  for (const username of ["design.lee", "scrum.anna"]) {
    teamService.addTeamMember(ownerId, wsId, productTeam.id, memberIds[username]);
  }
  teamService.addTeamMember(ownerId, wsId, qaTeam.id, memberIds["dev.alice"]);
  teamService.addTeamMember(ownerId, wsId, devopsTeam.id, memberIds["ops.ryan"]);
  teamService.addTeamMember(ownerId, wsId, supportTeam.id, memberIds["support.tom"]);

  // Tasks
  const taskDefs = [
    { title: "Implement workspace RBAC API", status: "in_progress", priority: "high", severity: "high", assignee: "dev.alice", creator: "jordan.lead" },
    { title: "Add team management endpoints", status: "in_progress", priority: "high", severity: "critical", assignee: "sam.senior", creator: "jordan.lead" },
    { title: "Design permission matrix UI", status: "todo", priority: "medium", severity: "medium", assignee: "design.lee", creator: "pm.sarah" },
    { title: "Set up CI pipeline for backend", status: "in_progress", priority: "high", severity: "high", assignee: "ops.ryan", creator: "mike.em" },
    { title: "Write integration tests for tasks API", status: "todo", priority: "medium", severity: "medium", assignee: "qa.priya", creator: "jordan.lead" },
    { title: "Onboard junior developer", status: "done", priority: "low", severity: "low", assignee: "dev.junior", creator: "jordan.lead" },
    { title: "Sprint planning Q3", status: "done", priority: "medium", severity: "low", assignee: "scrum.anna", creator: "pm.sarah" },
    { title: "Refactor notification service", status: "todo", priority: "medium", severity: "medium", assignee: "dev.bob", creator: "sam.senior" },
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
      `${t.title} — tracked in Acme Software workspace.`,
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
    if (t.assignee) {
      ActivityLogger.log({
        userId: userIds[t.creator],
        workspaceId: wsId,
        entityType: "task",
        entityId: id,
        action: "assigned",
        description: `Task "${t.title}" assigned to ${t.assignee}`,
        metadata: { assignee_id: userIds[t.assignee] },
      });
    }
  }

  // Issues
  const issueDefs = [
    { title: "Login timeout on slow networks", status: "open", priority: "high", severity: "critical", assignee: "dev.alice", creator: "support.tom" },
    { title: "Dashboard charts not rendering in Safari", status: "in_progress", priority: "medium", severity: "high", assignee: "dev.bob", creator: "qa.priya" },
    { title: "Permission denied after role change", status: "open", priority: "high", severity: "high", assignee: "sam.senior", creator: "alex.admin" },
    { title: "Export CSV missing assignee column", status: "resolved", priority: "low", severity: "medium", assignee: "dev.alice", creator: "pm.sarah" },
    { title: "Mobile layout overlap on tasks page", status: "in_progress", priority: "medium", severity: "medium", assignee: "design.lee", creator: "qa.priya" },
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

  // Subtasks
  const subtaskDefs = [
    { title: "Add middleware tests", taskIdx: 0, assignee: "dev.junior", creator: "jordan.lead", status: "todo" },
    { title: "Document RBAC endpoints", taskIdx: 0, assignee: "dev.alice", creator: "jordan.lead", status: "done" },
    { title: "Create team CRUD routes", taskIdx: 1, assignee: "sam.senior", creator: "jordan.lead", status: "in_progress" },
    { title: "Seed demo users script", taskIdx: 1, assignee: "dev.bob", creator: "sam.senior", status: "in_progress" },
    { title: "Configure GitHub Actions", taskIdx: 3, assignee: "ops.ryan", creator: "ops.ryan", status: "todo" },
    { title: "Add Docker compose for dev", taskIdx: 3, assignee: "ops.ryan", creator: "mike.em", status: "done" },
    { title: "Reproduce Safari bug", issueIdx: 1, assignee: "qa.priya", creator: "qa.priya", status: "done" },
    { title: "Fix flex layout on mobile", issueIdx: 4, assignee: "dev.bob", creator: "design.lee", status: "todo" },
    { title: "Verify role cache invalidation", issueIdx: 2, assignee: "sam.senior", creator: "alex.admin", status: "in_progress" },
    { title: "Update customer FAQ", issueIdx: 0, assignee: "support.tom", creator: "support.tom", status: "todo" },
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
    ActivityLogger.log({
      userId: userIds[s.creator],
      workspaceId: wsId,
      entityType: "subtask",
      entityId: id,
      action: s.status === "done" ? "completed" : "created",
      description: `Subtask "${s.title}" ${s.status === "done" ? "completed" : "created"}`,
      metadata: { task_id: taskId, issue_id: issueId },
    });
  }

  // Workspace-level activity
  ActivityLogger.log({
    userId: ownerId,
    workspaceId: wsId,
    entityType: "workspace",
    entityId: wsId,
    action: "demo_seeded",
    description: "Demo workspace seeded with users, teams, tasks, issues, and subtasks",
    metadata: { teams: 5, users: DEMO_USERS.length, tasks: taskDefs.length, issues: issueDefs.length },
  });

  console.log(`Demo workspace "${DEMO_WORKSPACE_NAME}" seeded (${DEMO_USERS.length} users, password: ${DEMO_PASSWORD})`);
}
