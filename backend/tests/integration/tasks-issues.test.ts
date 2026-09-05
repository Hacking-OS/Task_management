import { db } from "../../src/db.js";
import {
  createTask,
  updateTask,
  listTasks,
  getTask,
} from "../../src/services/tasks.js";
import {
  createIssue,
  updateIssue,
  listIssues,
  getIssue,
} from "../../src/services/issues.js";
import {
  createSubtask,
  updateSubtask,
  listSubtasks,
  getSubtask,
} from "../../src/services/subtasks.js";
import { unreadCount, listNotifications } from "../../src/services/notifications.js";
import { ActivityLogger } from "../../src/services/activityLogger.js";
import { addWorkspaceMember, createWorkspaceFixture } from "../setup/fixtures.js";

describe("tasks/issues/subtasks service integration", () => {
  describe("task updates", () => {
    it("updates severity, status, priority, assignees, and title", () => {
      const { id, owner } = createWorkspaceFixture("ti_task_upd");
      const assignee = addWorkspaceMember(id, "developer");
      const task = createTask(owner.id, {
        title: "Original Task",
        workspace_id: id,
        severity: "low",
        priority: "medium",
      });

      const updated = updateTask(owner.id, task.id, {
        title: "Updated Task",
        severity: "critical",
        priority: "high",
        assignee_id: assignee.id,
        status: "in_progress",
      });

      expect(updated.title).toBe("Updated Task");
      expect(updated.severity).toBe("critical");
      expect(updated.priority).toBe("high");
      expect(updated.assignee_id).toBe(assignee.id);
      expect(updated.status).toBe("in_progress");

      const logs = ActivityLogger.list({ userId: owner.id, workspaceId: id, entityId: task.id });
      expect(logs.some((l) => l.action === "severity_changed")).toBe(true);
      expect(logs.some((l) => l.action === "status_changed")).toBe(true);
      expect(logs.some((l) => l.action === "priority_changed")).toBe(true);
      expect(logs.some((l) => l.action === "assignment_changed")).toBe(true);
    });

    it("notifies assignee on create and reassignment", () => {
      const { id, owner } = createWorkspaceFixture("ti_task_assign");
      const assignee = addWorkspaceMember(id, "developer");
      const before = unreadCount(assignee.id);

      const task = createTask(owner.id, {
        title: "Assigned Task",
        workspace_id: id,
        assignee_ids: [assignee.id],
      });
      expect(unreadCount(assignee.id)).toBeGreaterThan(before);

      const other = addWorkspaceMember(id, "viewer");
      updateTask(owner.id, task.id, { assignee_id: other.id });
      const notifs = listNotifications(other.id);
      expect(notifs.some((n) => n.title === "Task assigned")).toBe(true);
    });

    it("checkDueTaskNotifications fires on listTasks for due-soon tasks", () => {
      const { id, owner } = createWorkspaceFixture("ti_task_due");
      const dueSoon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      createTask(owner.id, {
        title: "Due Soon Task",
        workspace_id: id,
        due_date: dueSoon,
      });

      const before = unreadCount(owner.id);
      listTasks(owner.id, id);
      expect(unreadCount(owner.id)).toBeGreaterThan(before);
      const notifs = listNotifications(owner.id);
      expect(notifs.some((n) => n.title === "Task due soon")).toBe(true);
    });

    it("listTasks without workspace aggregates across permitted workspaces", () => {
      const ws1 = createWorkspaceFixture("ti_multi_1");
      const ws2 = createWorkspaceFixture("ti_multi_2");
      createTask(ws1.owner.id, { title: "WS1 Task", workspace_id: ws1.id });
      createTask(ws2.owner.id, { title: "WS2 Task", workspace_id: ws2.id });

      const all = listTasks(ws1.owner.id);
      expect(all.some((t) => t.workspace_id === ws1.id)).toBe(true);
      expect(all.some((t) => t.workspace_id === ws2.id)).toBe(false);
    });

    it("getTask returns undefined for unauthorized user", () => {
      const { id, owner } = createWorkspaceFixture("ti_task_get");
      const outsider = addWorkspaceMember(createWorkspaceFixture("ti_task_other").id, "developer");
      const task = createTask(owner.id, { title: "Private", workspace_id: id });
      expect(getTask(outsider.id, task.id)).toBeUndefined();
    });
  });

  describe("issue updates", () => {
    it("updates severity, status, assignee, and description", () => {
      const { id, owner } = createWorkspaceFixture("ti_issue_upd");
      const assignee = addWorkspaceMember(id, "developer");
      const issue = createIssue(owner.id, {
        title: "Bug Report",
        workspace_id: id,
        severity: "medium",
      });

      const updated = updateIssue(owner.id, issue.id, {
        severity: "high",
        status: "in_progress",
        assignee_id: assignee.id,
        description: "Updated details",
        priority: "high",
      });

      expect(updated.severity).toBe("high");
      expect(updated.status).toBe("in_progress");
      expect(updated.assignee_id).toBe(assignee.id);
      expect(updated.description).toBe("Updated details");

      const logs = ActivityLogger.list({ userId: owner.id, workspaceId: id, entityId: issue.id });
      expect(logs.some((l) => l.action === "severity_changed")).toBe(true);
      expect(logs.some((l) => l.action === "status_changed")).toBe(true);
    });

    it("listIssues without workspace aggregates permitted workspaces", () => {
      const ws = createWorkspaceFixture("ti_issue_list");
      createIssue(ws.owner.id, { title: "Listed Issue", workspace_id: ws.id });
      const issues = listIssues(ws.owner.id);
      expect(issues.some((i) => i.title === "Listed Issue")).toBe(true);
    });

    it("getIssue returns undefined without permission", () => {
      const { id, owner } = createWorkspaceFixture("ti_issue_get");
      const otherWs = createWorkspaceFixture("ti_issue_foreign");
      const issue = createIssue(owner.id, { title: "Secret", workspace_id: id });
      expect(getIssue(otherWs.owner.id, issue.id)).toBeUndefined();
    });
  });

  describe("subtask updates", () => {
    it("updates severity, status, assignee, and title", () => {
      const { id, owner } = createWorkspaceFixture("ti_sub_upd");
      const assignee = addWorkspaceMember(id, "developer");
      const task = createTask(owner.id, { title: "Parent", workspace_id: id });
      const subtask = createSubtask(owner.id, {
        title: "Child",
        workspace_id: id,
        task_id: task.id,
        severity: "low",
      });

      const closedSlug = db.prepare(`
        SELECT slug FROM workspace_statuses
        WHERE workspace_id = ? AND entity_type = 'subtask' AND is_closed = 1 LIMIT 1
      `).get(id) as { slug: string } | undefined;

      const updated = updateSubtask(owner.id, subtask.id, {
        title: "Renamed Subtask",
        severity: "critical",
        assignee_id: assignee.id,
        status: closedSlug?.slug ?? subtask.status,
      });

      expect(updated.title).toBe("Renamed Subtask");
      expect(updated.severity).toBe("critical");
      expect(updated.assignee_id).toBe(assignee.id);

      const logs = ActivityLogger.list({ userId: owner.id, workspaceId: id, entityId: subtask.id });
      expect(logs.some((l) => l.action === "severity_changed")).toBe(true);
      if (closedSlug) {
        expect(logs.some((l) => l.action === "completed")).toBe(true);
      }
    });

    it("listSubtasks without workspace filter aggregates workspaces", () => {
      const { id, owner } = createWorkspaceFixture("ti_sub_list");
      const task = createTask(owner.id, { title: "Parent List", workspace_id: id });
      createSubtask(owner.id, { title: "Listed Sub", workspace_id: id, task_id: task.id });

      const all = listSubtasks(owner.id, { task_id: task.id });
      expect(all.some((s) => s.title === "Listed Sub")).toBe(true);
    });

    it("getSubtask returns undefined without permission", () => {
      const { id, owner } = createWorkspaceFixture("ti_sub_get");
      const foreign = createWorkspaceFixture("ti_sub_foreign");
      const task = createTask(owner.id, { title: "Parent", workspace_id: id });
      const subtask = createSubtask(owner.id, { title: "Hidden", workspace_id: id, task_id: task.id });
      expect(getSubtask(foreign.owner.id, subtask.id)).toBeUndefined();
    });
  });
});
