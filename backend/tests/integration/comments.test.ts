import { db } from "../../src/db.js";
import { createComment, deleteComment, listComments } from "../../src/services/comments.js";
import { createIssue } from "../../src/services/issues.js";
import { createTask } from "../../src/services/tasks.js";
import { createSubtask } from "../../src/services/subtasks.js";
import { addWorkspaceMember, createTestUser, createWorkspaceFixture, grantMemberOverride } from "../setup/fixtures.js";

describe("comments service", () => {
  it("lists comments for issue and subtask entities", () => {
    const { id, owner } = createWorkspaceFixture("cmt_list");
    const issue = createIssue(owner.id, { title: "Issue comments", workspace_id: id });
    const task = createTask(owner.id, { title: "Parent task", workspace_id: id });
    const subtask = createSubtask(owner.id, { title: "Sub comments", workspace_id: id, task_id: task.id });

    createComment(owner.id, {
      workspace_id: id,
      entity_type: "issue",
      entity_id: issue.id,
      body: "Issue note",
    });
    createComment(owner.id, {
      workspace_id: id,
      entity_type: "subtask",
      entity_id: subtask.id,
      body: "Subtask note",
    });

    expect(listComments(owner.id, "issue", issue.id).length).toBe(1);
    expect(listComments(owner.id, "subtask", subtask.id)[0].body).toBe("Subtask note");
  });

  it("throws when entity is missing", () => {
    const { owner } = createWorkspaceFixture("cmt_missing");
    expect(() => listComments(owner.id, "task", "00000000-0000-0000-0000-000000000099")).toThrow(
      "Entity not found",
    );
  });

  it("requires workspace_id on create", () => {
    const { id, owner } = createWorkspaceFixture("cmt_ws_req");
    const task = createTask(owner.id, { title: "Task", workspace_id: id });
    expect(() =>
      createComment(owner.id, { entity_type: "task", entity_id: task.id, body: "No workspace" }),
    ).toThrow("workspace_id is required");
  });

  it("rejects entity outside workspace on create", () => {
    const { id, owner } = createWorkspaceFixture("cmt_ws_mismatch");
    const other = createWorkspaceFixture("cmt_other");
    const foreignTask = createTask(other.owner.id, { title: "Foreign", workspace_id: other.id });
    expect(() =>
      createComment(owner.id, {
        workspace_id: id,
        entity_type: "task",
        entity_id: foreignTask.id,
        body: "Wrong workspace",
      }),
    ).toThrow("Task not found in workspace");
  });

  it("notifies mentioned workspace members", () => {
    const { id, owner } = createWorkspaceFixture("cmt_mention");
    const member = addWorkspaceMember(id, "developer");
    const task = createTask(owner.id, { title: "Mention task", workspace_id: id });

    createComment(owner.id, {
      workspace_id: id,
      entity_type: "task",
      entity_id: task.id,
      body: "Hey @dev",
      mentions: [member.id],
    });

    const notifications = db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'mention'")
      .all(member.id);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("deleteComment rejects wrong author even with delete permission", () => {
    const { id, owner } = createWorkspaceFixture("cmt_del_auth");
    const member = addWorkspaceMember(id, "developer");
    grantMemberOverride(id, member.id, ["comment.delete"]);
    const task = createTask(owner.id, { title: "Delete auth", workspace_id: id });
    const comment = createComment(owner.id, {
      workspace_id: id,
      entity_type: "task",
      entity_id: task.id,
      body: "Owner comment",
    });

    expect(() => deleteComment(member.id, comment.id)).toThrow("Comment not found");
    expect(listComments(owner.id, "task", task.id).length).toBe(1);
  });

  it("deleteComment removes comment for author", () => {
    const { id, owner } = createWorkspaceFixture("cmt_del_ok");
    const task = createTask(owner.id, { title: "Delete ok", workspace_id: id });
    const comment = createComment(owner.id, {
      workspace_id: id,
      entity_type: "task",
      entity_id: task.id,
      body: "Remove me",
    });

    deleteComment(owner.id, comment.id);
    expect(listComments(owner.id, "task", task.id).length).toBe(0);
  });

  it("non-member cannot list comments", () => {
    const { id, owner } = createWorkspaceFixture("cmt_perm");
    const outsider = createTestUser("cmt_outsider");
    const task = createTask(owner.id, { title: "Private", workspace_id: id });
    expect(() => listComments(outsider.id, "task", task.id)).toThrow();
  });
});
