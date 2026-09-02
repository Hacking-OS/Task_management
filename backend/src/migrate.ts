import { db } from "./db.js";

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
