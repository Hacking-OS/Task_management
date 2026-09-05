import { db } from "./db.js";
import { DEFAULT_ROLE_PERMISSIONS } from "./permissions/catalog.js";

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function tableSqlHasStatusCheck(table: string): boolean {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string } | undefined;
  return !!row?.sql && /CHECK\s*\(\s*status\s+IN/i.test(row.sql);
}

function relaxEntityStatusCheck(table: string, createSql: string, columns: string, indexes: string[] = []): void {
  if (!tableSqlHasStatusCheck(table)) return;
  db.exec("BEGIN");
  try {
    db.exec(`CREATE TABLE ${table}_status_mig (${createSql})`);
    db.exec(`INSERT INTO ${table}_status_mig (${columns}) SELECT ${columns} FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_status_mig RENAME TO ${table}`);
    for (const idx of indexes) db.exec(idx);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateRelaxStatusConstraints(): void {
  relaxEntityStatusCheck(
    "tasks",
    `id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      severity TEXT NOT NULL DEFAULT 'medium'`,
    "id, user_id, workspace_id, title, description, status, priority, due_date, created_at, updated_at, assignee_id, severity",
    ["CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)"]
  );

  relaxEntityStatusCheck(
    "issues",
    `id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      severity TEXT NOT NULL DEFAULT 'medium'`,
    "id, user_id, workspace_id, title, description, status, priority, assignee_id, created_at, updated_at, severity",
    ["CREATE INDEX IF NOT EXISTS idx_issues_user ON issues(user_id)"]
  );

  relaxEntityStatusCheck(
    "subtasks",
    `id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      severity TEXT NOT NULL DEFAULT 'medium'`,
    "id, user_id, task_id, issue_id, workspace_id, title, status, assignee_id, created_at, updated_at, severity",
    [
      "CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id)",
      "CREATE INDEX IF NOT EXISTS idx_subtasks_issue ON subtasks(issue_id)",
    ]
  );
}

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'issue', 'subtask')),
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_workspace ON activity_logs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_issues_user ON issues(user_id);
    CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
    CREATE INDEX IF NOT EXISTS idx_subtasks_issue ON subtasks(issue_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_entity ON assignments(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
  `);

  addColumnIfMissing("notifications", "workspace_id", "TEXT REFERENCES workspaces(id) ON DELETE SET NULL");
  addColumnIfMissing("notifications", "entity_type", "TEXT");
  addColumnIfMissing("notifications", "entity_id", "TEXT");
  addColumnIfMissing("notifications", "metadata", "TEXT");
  addColumnIfMissing("tasks", "assignee_id", "TEXT REFERENCES users(id) ON DELETE SET NULL");
  addColumnIfMissing("tasks", "severity", "TEXT NOT NULL DEFAULT 'medium'");
  addColumnIfMissing("issues", "severity", "TEXT NOT NULL DEFAULT 'medium'");
  addColumnIfMissing("subtasks", "severity", "TEXT NOT NULL DEFAULT 'medium'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      permission_group TEXT NOT NULL DEFAULT 'General'
    );

    CREATE TABLE IF NOT EXISTS workspace_roles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, slug)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES workspace_roles(id) ON DELETE CASCADE,
      permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_code)
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES workspace_roles(id) ON DELETE RESTRICT,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_invitations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES workspace_roles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired')),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_roles_ws ON workspace_roles(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_invitations_ws ON workspace_invitations(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);

    CREATE TABLE IF NOT EXISTS workspace_statuses (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'issue', 'subtask')),
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, entity_type, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_statuses_ws ON workspace_statuses(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_statuses_entity ON workspace_statuses(workspace_id, entity_type);

    CREATE TABLE IF NOT EXISTS workspace_member_permissions (
      member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
      permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
      effect TEXT NOT NULL CHECK(effect IN ('grant', 'deny')),
      PRIMARY KEY (member_id, permission_code)
    );

    CREATE INDEX IF NOT EXISTS idx_member_permissions_member ON workspace_member_permissions(member_id);

    CREATE TABLE IF NOT EXISTS workspace_teams (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      lead_member_id TEXT REFERENCES workspace_members(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, name)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, member_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_teams_ws ON workspace_teams(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_id);
  `);

  migrateRelaxStatusConstraints();

  addColumnIfMissing("workspace_files", "category", "TEXT NOT NULL DEFAULT 'general'");
  addColumnIfMissing("workspace_files", "entity_id", "TEXT");
  addColumnIfMissing("workspace_files", "mime_type", "TEXT NOT NULL DEFAULT 'application/octet-stream'");
  addColumnIfMissing("users", "avatar_path", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'issue', 'subtask')),
      entity_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      hours REAL NOT NULL CHECK(hours > 0 AND hours <= 24),
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_time_entries_workspace ON time_entries(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_entity ON time_entries(entity_type, entity_id);
  `);

  migrateDropWorkspaceRootPath();
  backfillOrphanWorkspaceEntities();
  migrateApprovalFlows();
  migrateInvitationCodes();
  migrateUserActiveWorkspace();
  migratePermissionSystem();
  migrateSecurityHardening();
  migrateProjects();
  migrateRelaxApprovalRequestStatus();
  migrateRelaxTeamJoinRequestStatus();
}

export function migrateProjectPermissions(): void {
  const roles = db.prepare(`
    SELECT id, slug FROM workspace_roles WHERE is_system = 1
  `).all() as { id: string; slug: string }[];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_code, effect) VALUES (?, ?, 'allow')
  `);

  for (const role of roles) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role.slug] ?? [];
    const existing = new Set(
      (db.prepare("SELECT permission_code FROM role_permissions WHERE role_id = ?").all(role.id) as { permission_code: string }[])
        .map((r) => r.permission_code)
    );
    for (const code of defaults) {
      if (code.startsWith("project.") && !existing.has(code)) {
        insert.run(role.id, code);
      }
    }
  }
}

function migrateProjects(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      lead_member_id TEXT REFERENCES workspace_members(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, name)
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
      role_in_project TEXT NOT NULL DEFAULT 'member' CHECK(role_in_project IN ('lead', 'member', 'reviewer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS project_teams (
      project_id TEXT NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
      PRIMARY KEY (project_id, team_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_projects_ws ON workspace_projects(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_project_members_member ON project_members(member_id, status);
    CREATE INDEX IF NOT EXISTS idx_project_teams_team ON project_teams(team_id, status);
    CREATE INDEX IF NOT EXISTS idx_project_teams_ws ON project_teams(workspace_id);
  `);

  addColumnIfMissing("tasks", "project_id", "TEXT");
  addColumnIfMissing("issues", "project_id", "TEXT");
  addColumnIfMissing("time_entries", "project_id", "TEXT");
  addColumnIfMissing("team_members", "role_in_team", "TEXT NOT NULL DEFAULT 'member'");
}

function migrateSecurityHardening(): void {
  addColumnIfMissing("workspace_members", "security_version", "INTEGER NOT NULL DEFAULT 1");

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash TEXT,
      user_agent TEXT NOT NULL DEFAULT '',
      source_ip TEXT,
      security_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, status);

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      request_id TEXT,
      session_id TEXT,
      actor_user_id TEXT,
      workspace_id TEXT,
      team_id TEXT,
      source_ip TEXT,
      user_agent TEXT NOT NULL DEFAULT '',
      http_method TEXT,
      route TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      result TEXT NOT NULL CHECK(result IN ('SUCCESS', 'DENIED', 'FAILED', 'BLOCKED', 'REQUIRES_APPROVAL')),
      reason TEXT NOT NULL DEFAULT '',
      status_code INTEGER,
      risk_level TEXT NOT NULL DEFAULT 'INFO' CHECK(risk_level IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      metadata TEXT NOT NULL DEFAULT '{}',
      previous_hash TEXT NOT NULL DEFAULT '',
      event_hash TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_security_events_workspace ON security_events(workspace_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_security_events_actor ON security_events(actor_user_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_security_events_action ON security_events(action, timestamp);
    CREATE INDEX IF NOT EXISTS idx_security_events_risk ON security_events(risk_level, timestamp);
  `);

  addColumnIfMissing("user_sessions", "token_family_id", "TEXT");
  addColumnIfMissing("user_sessions", "previous_refresh_token_hash", "TEXT");
}

function migratePermissionSystem(): void {
  addColumnIfMissing("role_permissions", "effect", "TEXT NOT NULL DEFAULT 'allow'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS team_membership_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
      requester_member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
      decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      rejection_reason TEXT NOT NULL DEFAULT '',
      attempt_number INTEGER NOT NULL DEFAULT 1,
      previous_request_id TEXT REFERENCES team_membership_requests(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_team_join_requests_team ON team_membership_requests(team_id, status);
    CREATE INDEX IF NOT EXISTS idx_team_join_requests_member ON team_membership_requests(requester_member_id);

    CREATE TABLE IF NOT EXISTS team_assignments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'issue', 'subtask')),
      entity_id TEXT NOT NULL,
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_id, team_id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_assignments_entity ON team_assignments(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_team_assignments_team ON team_assignments(team_id);
  `);

  addColumnIfMissing("approval_requests", "request_type", "TEXT NOT NULL DEFAULT 'permission_grant'");
  addColumnIfMissing("approval_requests", "target_type", "TEXT");
  addColumnIfMissing("approval_requests", "target_id", "TEXT");
  addColumnIfMissing("approval_requests", "action", "TEXT");
  addColumnIfMissing("approval_requests", "payload_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing("approval_requests", "attempt_number", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("approval_requests", "previous_request_id", "TEXT");
  addColumnIfMissing("approval_requests", "decided_by", "TEXT");
  addColumnIfMissing("approval_requests", "metadata", "TEXT NOT NULL DEFAULT '{}'");
}

function migrateUserActiveWorkspace(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_workspace_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_workspace_prefs_ws ON user_workspace_preferences(active_workspace_id);
  `);

  const members = db.prepare(`
    SELECT DISTINCT m.user_id, w.id AS workspace_id
    FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE w.is_active = 1
  `).all() as { user_id: string; workspace_id: string }[];

  const upsert = db.prepare(`
    INSERT INTO user_workspace_preferences (user_id, active_workspace_id, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO NOTHING
  `);

  for (const row of members) {
    upsert.run(row.user_id, row.workspace_id);
  }

  const usersWithoutPref = db.prepare(`
    SELECT m.user_id, MIN(w.id) AS workspace_id
    FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN user_workspace_preferences p ON p.user_id = m.user_id
    WHERE p.user_id IS NULL
    GROUP BY m.user_id
  `).all() as { user_id: string; workspace_id: string }[];

  for (const row of usersWithoutPref) {
    upsert.run(row.user_id, row.workspace_id);
  }
}

function migrateInvitationCodes(): void {
  addColumnIfMissing("workspace_invitations", "invite_code", "TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_code ON workspace_invitations(invite_code)");

  const rows = db.prepare(`
    SELECT id FROM workspace_invitations WHERE invite_code IS NULL OR invite_code = ''
  `).all() as { id: string }[];

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const stmt = db.prepare("UPDATE workspace_invitations SET invite_code = ? WHERE id = ?");

  for (const row of rows) {
    for (let attempt = 0; attempt < 30; attempt++) {
      let code = "";
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
      const taken = db.prepare("SELECT id FROM workspace_invitations WHERE invite_code = ?").get(code);
      if (!taken) {
        stmt.run(code, row.id);
        break;
      }
    }
  }
}

function migrateApprovalFlows(): void {
  addColumnIfMissing("workspaces", "approval_flows_enabled", "INTEGER NOT NULL DEFAULT 1");

  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      approver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      resolution_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_approval_requests_workspace ON approval_requests(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_approver ON approval_requests(approver_id, status);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requester_id);
  `);
}

function backfillOrphanWorkspaceEntities(): void {
  const acme = db.prepare("SELECT id FROM workspaces WHERE name = 'Acme Software' LIMIT 1").get() as { id: string } | undefined;
  if (!acme) return;

  const wsId = acme.id;
  for (const table of ["tasks", "issues", "subtasks", "comments", "activity_logs"] as const) {
    db.prepare(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id IS NULL`).run(wsId);
  }

  if (columnExists("notifications", "workspace_id")) {
    db.prepare("UPDATE notifications SET workspace_id = ? WHERE workspace_id IS NULL").run(wsId);
  }

  if (columnExists("time_entries", "workspace_id")) {
    db.prepare("UPDATE time_entries SET workspace_id = ? WHERE workspace_id IS NULL").run(wsId);

    const { c } = db.prepare("SELECT count(*) AS c FROM time_entries WHERE workspace_id = ?").get(wsId) as { c: number };
    if (c > 0) return;

    const demo = db.prepare("SELECT id FROM users WHERE username = 'demo' LIMIT 1").get() as { id: string } | undefined;
    const task = db.prepare("SELECT id FROM tasks WHERE workspace_id = ? LIMIT 1").get(wsId) as { id: string } | undefined;
    const issue = db.prepare("SELECT id FROM issues WHERE workspace_id = ? LIMIT 1").get(wsId) as { id: string } | undefined;
    if (!demo) return;

    if (task) {
      db.prepare(`
        INSERT INTO time_entries (id, user_id, workspace_id, entity_type, entity_id, work_date, hours, description)
        VALUES (?, ?, ?, 'task', ?, date('now'), 2.5, 'RBAC API implementation')
      `).run(crypto.randomUUID(), demo.id, wsId, task.id);
    }
    if (issue) {
      db.prepare(`
        INSERT INTO time_entries (id, user_id, workspace_id, entity_type, entity_id, work_date, hours, description)
        VALUES (?, ?, ?, 'issue', ?, date('now', '-1 day'), 4, 'Investigated login timeout reports')
      `).run(crypto.randomUUID(), demo.id, wsId, issue.id);
    }
  }
}

function migrateRelaxApprovalRequestStatus(): void {
  if (!tableSqlHasStatusCheck("approval_requests")) return;
  relaxEntityStatusCheck(
    "approval_requests",
    `id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      approver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      resolution_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      request_type TEXT NOT NULL DEFAULT 'permission_grant',
      target_type TEXT,
      target_id TEXT,
      action TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      attempt_number INTEGER NOT NULL DEFAULT 1,
      previous_request_id TEXT,
      decided_by TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'`,
    "id, workspace_id, requester_id, approver_id, permission_code, title, description, status, resolution_note, created_at, updated_at, resolved_at, request_type, target_type, target_id, action, payload_json, attempt_number, previous_request_id, decided_by, metadata",
    [
      "CREATE INDEX IF NOT EXISTS idx_approval_requests_workspace ON approval_requests(workspace_id)",
      "CREATE INDEX IF NOT EXISTS idx_approval_requests_approver ON approval_requests(approver_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requester_id)",
    ]
  );
}

function migrateRelaxTeamJoinRequestStatus(): void {
  if (!tableSqlHasStatusCheck("team_membership_requests")) return;
  relaxEntityStatusCheck(
    "team_membership_requests",
    `id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
      requester_member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      rejection_reason TEXT NOT NULL DEFAULT '',
      attempt_number INTEGER NOT NULL DEFAULT 1,
      previous_request_id TEXT REFERENCES team_membership_requests(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT`,
    "id, workspace_id, team_id, requester_member_id, reason, status, decided_by, rejection_reason, attempt_number, previous_request_id, created_at, updated_at, decided_at",
    [
      "CREATE INDEX IF NOT EXISTS idx_team_join_requests_team ON team_membership_requests(team_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_team_join_requests_member ON team_membership_requests(requester_member_id)",
    ]
  );
}

function migrateDropWorkspaceRootPath(): void {
  if (!columnExists("workspaces", "root_path")) return;

  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE workspaces_no_root (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT INTO workspaces_no_root (id, user_id, name, description, is_active, created_at, updated_at)
      SELECT id, user_id, name, description, is_active, created_at, updated_at FROM workspaces
    `);
    db.exec("DROP TABLE workspaces");
    db.exec("ALTER TABLE workspaces_no_root RENAME TO workspaces");
    db.exec("CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id)");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
