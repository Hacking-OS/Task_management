import fs from "fs";
import path from "path";
import { getStakeholderUserIds } from "../../src/services/entityStakeholders.js";
import {
  sanitizeMemberForViewer,
  sanitizeRoleForViewer,
  sanitizeRolesForViewer,
} from "../../src/services/permissionVisibility.js";
import { recordSeverityChange } from "../../src/services/severityEvents.js";
import { getWorkspaceStorageDir, removeWorkspaceStorageDir } from "../../src/services/workspacePaths.js";
import { ActivityLogger } from "../../src/services/activityLogger.js";
import {
  logEntityActivity,
  resolveCommentParent,
  resolveFileStakeholderTarget,
} from "../../src/services/entityEvents.js";
import { getSeverityStats, getDashboardStats } from "../../src/services/stats.js";
import { createTask } from "../../src/services/tasks.js";
import { createIssue } from "../../src/services/issues.js";
import { createSubtask } from "../../src/services/subtasks.js";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  listTimeEntries,
} from "../../src/services/timeEntries.js";
import {
  uploadCategorizedFile,
  deleteFile,
  readFileContent,
  listFilesByEntity,
} from "../../src/services/files.js";
import { createRole, updateRolePermissions } from "../../src/services/workspaceRoles.js";
import { listMembers } from "../../src/services/authorization.js";
import { getRoleBySlug } from "../../src/services/workspaceRoles.js";
import { addWorkspaceMember, createTestUser, createWorkspaceFixture } from "../setup/fixtures.js";

describe("entityStakeholders", () => {
  it("returns creator and assignee user ids for a task", () => {
    const { id, owner } = createWorkspaceFixture("stk");
    const assignee = addWorkspaceMember(id, "developer");
    const task = createTask(owner.id, {
      title: "Stakeholder task",
      workspace_id: id,
      assignee_ids: [assignee.id],
    });

    const ids = getStakeholderUserIds("task", task.id);
    expect(ids).toContain(owner.id);
    expect(ids).toContain(assignee.id);
  });

  it("returns empty array for unknown entity", () => {
    expect(getStakeholderUserIds("task", "nonexistent-id")).toEqual([]);
  });
});

describe("permissionVisibility", () => {
  it("hides owner permissions from non-owner viewers", () => {
    const { id, owner } = createWorkspaceFixture("vis");
    const viewer = addWorkspaceMember(id, "developer");
    const members = listMembers(id);
    const ownerMember = members.find((m) => m.role_slug === "owner")!;

    const sanitized = sanitizeMemberForViewer(ownerMember, viewer.id, id);
    expect(sanitized.permissions_hidden).toBe(true);
    expect(sanitized.role_permissions).toBeUndefined();
    expect(sanitized.effective_permissions).toBeUndefined();
  });

  it("shows owner permissions to the owner themselves", () => {
    const { id, owner } = createWorkspaceFixture("vis_self");
    const members = listMembers(id);
    const ownerMember = members.find((m) => m.role_slug === "owner")!;

    const sanitized = sanitizeMemberForViewer(ownerMember, owner.id, id);
    expect(sanitized.permissions_hidden).toBeUndefined();
    expect(sanitized.effective_permissions?.length).toBeGreaterThan(0);
  });

  it("sanitizes owner role for non-owner viewers", () => {
    const { id, owner } = createWorkspaceFixture("vis_role");
    const viewer = addWorkspaceMember(id, "developer");
    const ownerRole = getRoleBySlug(id, "owner")!;

    const sanitized = sanitizeRoleForViewer(
      { ...ownerRole, permissions: ["workspace.view", "task.view"] },
      viewer.id,
      id,
    );
    expect(sanitized.permissions_hidden).toBe(true);
    expect(sanitized.permissions).toBeUndefined();

    const forOwner = sanitizeRoleForViewer(
      { ...ownerRole, permissions: ["workspace.view"] },
      owner.id,
      id,
    );
    expect(forOwner.permissions).toEqual(["workspace.view"]);
  });

  it("sanitizeRolesForViewer maps all roles", () => {
    const { id } = createWorkspaceFixture("vis_roles");
    const viewer = createTestUser("vis_roles_viewer");
    const ownerRole = getRoleBySlug(id, "owner")!;
    const devRole = getRoleBySlug(id, "developer")!;

    const result = sanitizeRolesForViewer(
      [
        { ...ownerRole, permissions: ["a"] },
        { ...devRole, permissions: ["b"] },
      ],
      viewer.id,
      id,
    );
    expect(result[0].permissions_hidden).toBe(true);
    expect(result[1].permissions).toEqual(["b"]);
  });
});

describe("severityEvents", () => {
  it("records activity log on severity change", () => {
    const { id, owner } = createWorkspaceFixture("sev_evt");
    const task = createTask(owner.id, { title: "Severity task", workspace_id: id, severity: "low" });
    const before = ActivityLogger.list({ userId: owner.id, workspaceId: id }).length;

    recordSeverityChange({
      userId: owner.id,
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title,
      workspaceId: id,
      assigneeId: null,
      oldSeverity: "low",
      newSeverity: "critical",
    });

    const after = ActivityLogger.list({ userId: owner.id, workspaceId: id });
    expect(after.length).toBeGreaterThan(before);
    expect(after.some((l) => l.action === "severity_changed")).toBe(true);
  });

  it("skips when severity unchanged", () => {
    const { id, owner } = createWorkspaceFixture("sev_same");
    const task = createTask(owner.id, { title: "Same severity", workspace_id: id, severity: "medium" });
    const before = ActivityLogger.list({ userId: owner.id, workspaceId: id }).length;

    recordSeverityChange({
      userId: owner.id,
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title,
      workspaceId: id,
      assigneeId: null,
      oldSeverity: "medium",
      newSeverity: "medium",
    });

    expect(ActivityLogger.list({ userId: owner.id, workspaceId: id }).length).toBe(before);
  });
});

describe("workspacePaths", () => {
  it("creates and removes workspace storage directory", () => {
    const { id } = createWorkspaceFixture("paths");
    const dir = getWorkspaceStorageDir(id);
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir).toContain(path.join("uploads", id));

    removeWorkspaceStorageDir(id);
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe("activityLogger", () => {
  it("logs and lists activity entries", () => {
    const { id, owner } = createWorkspaceFixture("act_log");
    const entry = ActivityLogger.log({
      userId: owner.id,
      workspaceId: id,
      entityType: "workspace",
      entityId: id,
      action: "test_action",
      description: "Test activity entry",
      metadata: { key: "value" },
    });

    expect(entry.id).toBeDefined();
    expect(entry.action).toBe("test_action");

    const logs = ActivityLogger.list({ userId: owner.id, workspaceId: id });
    expect(logs.some((l) => l.id === entry.id)).toBe(true);
  });
});

describe("entityEvents", () => {
  it("logEntityActivity writes to activity log", () => {
    const { id, owner } = createWorkspaceFixture("ent_evt");
    const task = createTask(owner.id, { title: "Entity event task", workspace_id: id });

    logEntityActivity({
      userId: owner.id,
      workspaceId: id,
      entityType: "task",
      entityId: task.id,
      action: "custom_event",
      description: "Custom entity activity",
    });

    const logs = ActivityLogger.list({ userId: owner.id, workspaceId: id, entityType: "task", entityId: task.id });
    expect(logs.some((l) => l.action === "custom_event")).toBe(true);
  });

  it("resolveCommentParent returns entity for task/issue/subtask", () => {
    expect(resolveCommentParent("task", "task-1")).toEqual({ type: "task", id: "task-1" });
    expect(resolveCommentParent("issue", "issue-1")).toEqual({ type: "issue", id: "issue-1" });
    expect(resolveCommentParent("unknown", "x")).toBeNull();
  });

  it("resolveFileStakeholderTarget resolves direct entities", () => {
    expect(resolveFileStakeholderTarget("task", "t1")).toEqual({ type: "task", id: "t1" });
    expect(resolveFileStakeholderTarget("other", "x")).toBeNull();
  });
});

describe("stats service", () => {
  it("getSeverityStats returns counts for workspace", () => {
    const { id, owner } = createWorkspaceFixture("stats_svc");
    createTask(owner.id, { title: "Stats task", workspace_id: id, severity: "high" });

    const stats = getSeverityStats(owner.id, id);
    expect(stats.tasks.high).toBeGreaterThanOrEqual(1);
    expect(stats.issues).toBeDefined();
    expect(stats.subtasks).toBeDefined();
  });

  it("getDashboardStats returns full dashboard shape", () => {
    const { id, owner } = createWorkspaceFixture("dash_svc");
    const stats = getDashboardStats(owner.id, id);

    expect(stats.totals).toBeDefined();
    expect(stats.byStatus).toBeDefined();
    expect(stats.completion.overall).toBeDefined();
    expect(stats.completion.taskSubtaskProgress).toBeDefined();
    expect(stats.severity).toBeDefined();
  });

  it("getDashboardStats aggregates across accessible workspaces without workspace filter", () => {
    const { id, owner } = createWorkspaceFixture("dash_all");
    createTask(owner.id, { title: "Cross ws task", workspace_id: id, severity: "medium" });
    const stats = getDashboardStats(owner.id);
    expect(stats.totals.tasks).toBeGreaterThanOrEqual(1);
  });

  it("getDashboardStats includes subtask progress when tasks have subtasks", () => {
    const { id, owner } = createWorkspaceFixture("dash_subprog");
    const task = createTask(owner.id, { title: "Parent", workspace_id: id });
    createSubtask(owner.id, { title: "Child", workspace_id: id, task_id: task.id, status: "done" });

    const stats = getDashboardStats(owner.id, id);
    expect(stats.completion.taskSubtaskProgress.tasksWithSubtasks).toBeGreaterThanOrEqual(1);
    expect(stats.completion.taskSubtaskProgress.totalSubtasks).toBeGreaterThanOrEqual(1);
  });

  it("getSeverityStats counts issues and subtasks", () => {
    const { id, owner } = createWorkspaceFixture("stats_all_types");
    const task = createTask(owner.id, { title: "T", workspace_id: id, severity: "low" });
    createIssue(owner.id, { title: "I", workspace_id: id, severity: "high" });
    createSubtask(owner.id, { title: "S", workspace_id: id, task_id: task.id, severity: "critical" });

    const stats = getSeverityStats(owner.id, id);
    expect(stats.tasks.low).toBeGreaterThanOrEqual(1);
    expect(stats.issues.high).toBeGreaterThanOrEqual(1);
    expect(stats.subtasks.critical).toBeGreaterThanOrEqual(1);
  });
});

describe("timeEntries service", () => {
  it("update and delete enforce ownership or view_all permission", () => {
    const { id, owner } = createWorkspaceFixture("time_svc");
    const member = addWorkspaceMember(id, "developer");
    const task = createTask(owner.id, { title: "Time task", workspace_id: id });

    const entry = createTimeEntry(owner.id, id, {
      entity_type: "task",
      entity_id: task.id,
      work_date: "2026-03-02",
      hours: 2,
      description: "Initial",
    });

    const updated = updateTimeEntry(owner.id, entry.id, { hours: 3, description: "Updated" });
    expect(updated.hours).toBe(3);

    expect(() => updateTimeEntry(member.id, entry.id, { hours: 4 })).toThrow();
    expect(() => deleteTimeEntry(member.id, entry.id)).toThrow();

    deleteTimeEntry(owner.id, entry.id);
    expect(listTimeEntries(owner.id, id, { entity_id: task.id }).length).toBe(0);
  });

  it("throws when updating missing entry", () => {
    const { id, owner } = createWorkspaceFixture("time_missing");
    expect(() => updateTimeEntry(owner.id, "00000000-0000-0000-0000-000000000099", { hours: 1 })).toThrow(
      "Time entry not found",
    );
  });
});

describe("files service", () => {
  it("uploads and deletes categorized task file", () => {
    const { id, owner } = createWorkspaceFixture("files_svc");
    const task = createTask(owner.id, { title: "File task", workspace_id: id });

    const file = uploadCategorizedFile(
      owner.id,
      id,
      "task",
      task.id,
      "spec.txt",
      "text/plain",
      Buffer.from("attachment"),
    );
    expect(listFilesByEntity(owner.id, id, "task", task.id).some((f) => f.id === file.id)).toBe(true);

    const { buffer } = readFileContent(owner.id, file.id);
    expect(buffer.toString()).toBe("attachment");

    deleteFile(owner.id, file.id);
    expect(() => readFileContent(owner.id, file.id)).toThrow("File not found");
  });

  it("rejects oversized uploads", () => {
    const { id, owner } = createWorkspaceFixture("files_big");
    const huge = Buffer.alloc(16 * 1024 * 1024);
    expect(() =>
      uploadCategorizedFile(owner.id, id, "general", id, "big.bin", "application/octet-stream", huge),
    ).toThrow("File exceeds 15 MB limit");
  });

  it("rejects entity outside workspace", () => {
    const { id, owner } = createWorkspaceFixture("files_ws");
    const other = createWorkspaceFixture("files_other");
    const foreignTask = createTask(other.owner.id, { title: "Foreign", workspace_id: other.id });
    expect(() =>
      uploadCategorizedFile(owner.id, id, "task", foreignTask.id, "x.txt", "text/plain", Buffer.from("x")),
    ).toThrow("Task not found in workspace");
  });
});

describe("workspaceRoles service", () => {
  it("creates custom role with permissions", () => {
    const { id } = createWorkspaceFixture("roles_create");
    const role = createRole(id, "Custom Analyst", ["task.view", "issue.view"]);
    expect(role.slug).toContain("custom-analyst");
    expect(role.is_system).toBe(0);
  });

  it("updates role permissions for non-owner roles", () => {
    const { id } = createWorkspaceFixture("roles_update");
    const role = createRole(id, "Editor Plus", ["task.view"]);
    const updated = updateRolePermissions(id, role.id, ["task.view", "task.edit"]);
    expect(updated.id).toBe(role.id);
  });

  it("rejects duplicate role names", () => {
    const { id } = createWorkspaceFixture("roles_dup");
    createRole(id, "Duplicate Role", ["task.view"]);
    expect(() => createRole(id, "Duplicate Role", ["issue.view"])).toThrow(
      "A role with a similar name already exists",
    );
  });
});
