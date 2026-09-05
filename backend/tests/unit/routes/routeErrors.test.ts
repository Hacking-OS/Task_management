import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import type { Express } from "express";
import { authHeader } from "../../helpers/apiAgent.js";

function serviceError(): never {
  throw new Error("Simulated service failure");
}

function wsPath(workspaceId: string, suffix: string): string {
  return `/api/workspaces/${workspaceId}${suffix}`;
}

type WorkspaceFixture = { id: string; owner: { id: string; accessToken: string } };
type TestUser = WorkspaceFixture["owner"];

const mocks = {
  listTasks: jest.fn(),
  getTask: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  listTasksInWorkspace: jest.fn(),
  createTaskInWorkspace: jest.fn(),
  listIssues: jest.fn(),
  listIssuesInWorkspace: jest.fn(),
  createIssueInWorkspace: jest.fn(),
  getIssue: jest.fn(),
  createIssue: jest.fn(),
  updateIssue: jest.fn(),
  deleteIssue: jest.fn(),
  listSubtasks: jest.fn(),
  listSubtasksInWorkspace: jest.fn(),
  createSubtaskInWorkspace: jest.fn(),
  createSubtask: jest.fn(),
  updateSubtask: jest.fn(),
  deleteSubtask: jest.fn(),
  listComments: jest.fn(),
  createComment: jest.fn(),
  deleteComment: jest.fn(),
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  deleteNotification: jest.fn(),
  unreadCount: jest.fn(),
  getSeverityStats: jest.fn(),
  getDashboardStats: jest.fn(),
  listFiles: jest.fn(),
  uploadCategorizedFile: jest.fn(),
  uploadUserAvatar: jest.fn(),
  getUserAvatarPath: jest.fn(),
  readFileContent: jest.fn(),
  deleteFile: jest.fn(),
  listTimeEntries: jest.fn(),
  getTimeSummary: jest.fn(),
  createTimeEntry: jest.fn(),
  updateTimeEntry: jest.fn(),
  deleteTimeEntry: jest.fn(),
  listWorkspacesWithMembership: jest.fn(),
  getActiveWorkspace: jest.fn(),
  createWorkspace: jest.fn(),
  getWorkspace: jest.fn(),
  getWorkspacePermissions: jest.fn(),
  activateWorkspace: jest.fn(),
  updateWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  setApprovalFlowsEnabled: jest.fn(),
  getWorkspacePermissionMatrix: jest.fn(),
  createRole: jest.fn(),
  renameRole: jest.fn(),
  deleteRole: jest.fn(),
  updateRolePermissions: jest.fn(),
  updateRolePermissionEffects: jest.fn(),
  resetRolePermissions: jest.fn(),
  cloneRole: jest.fn(),
  getRoleWithPermissions: jest.fn(),
  listMembers: jest.fn(),
  getMemberWithPermissions: jest.fn(),
  changeMemberRole: jest.fn(),
  removeMember: jest.fn(),
  updateMemberPermissions: jest.fn(),
  resetMemberPermissions: jest.fn(),
  listInvitations: jest.fn(),
  resendInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
  getInvitationPreview: jest.fn(),
  listMyPendingInvitations: jest.fn(),
  acceptInvitation: jest.fn(),
  rejectInvitation: jest.fn(),
  listStatuses: jest.fn(),
  createStatus: jest.fn(),
  updateStatus: jest.fn(),
  deleteStatus: jest.fn(),
  listTeams: jest.fn(),
  createTeam: jest.fn(),
  getTeam: jest.fn(),
  updateTeam: jest.fn(),
  deleteTeam: jest.fn(),
  setTeamLead: jest.fn(),
  addTeamMember: jest.fn(),
  removeTeamMember: jest.fn(),
  listTeamJoinRequestsForLead: jest.fn(),
  getMyTeamJoinStatus: jest.fn(),
  requestTeamMembership: jest.fn(),
  approveTeamJoinRequest: jest.fn(),
  rejectTeamJoinRequest: jest.fn(),
  listMyTeamJoinRequests: jest.fn(),
  listProjectSummaries: jest.fn(),
  createProject: jest.fn(),
  getProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  setProjectTeams: jest.fn(),
  addProjectMember: jest.fn(),
  removeProjectMember: jest.fn(),
  setProjectLead: jest.fn(),
  listProjectsForTeam: jest.fn(),
  getWorkspaceOverview: jest.fn(),
  getMemberManagementSummary: jest.fn(),
  listTeamAssignmentsForEntity: jest.fn(),
  listTeamAssignmentsForTeam: jest.fn(),
  assignTeamToEntity: jest.fn(),
  removeTeamFromEntity: jest.fn(),
  createInvitation: jest.fn(),
  listPendingApprovalsForDecider: jest.fn(),
  isApprovalFlowsEnabled: jest.fn(),
  listAllApprovals: jest.fn(),
  listMyApprovalRequests: jest.fn(),
  createApprovalRequest: jest.fn(),
  approveRequest: jest.fn(),
  rejectRequest: jest.fn(),
  getUser: jest.fn(),
  listActiveSessions: jest.fn(),
  listSecurityEvents: jest.fn(),
  activityList: jest.fn(),
  activityForEntity: jest.fn(),
};

type ActualModules = {
  tasks: typeof import("../../../src/services/tasks.js");
  issues: typeof import("../../../src/services/issues.js");
  subtasks: typeof import("../../../src/services/subtasks.js");
  comments: typeof import("../../../src/services/comments.js");
  notifications: typeof import("../../../src/services/notifications.js");
  stats: typeof import("../../../src/services/stats.js");
  files: typeof import("../../../src/services/files.js");
  timeEntries: typeof import("../../../src/services/timeEntries.js");
  workspaces: typeof import("../../../src/services/workspaces.js");
  workspaceMembers: typeof import("../../../src/services/workspaceMembers.js");
  workspaceRoles: typeof import("../../../src/services/workspaceRoles.js");
  workspaceStatuses: typeof import("../../../src/services/workspaceStatuses.js");
  teams: typeof import("../../../src/services/teams.js");
  teamMembershipRequests: typeof import("../../../src/services/teamMembershipRequests.js");
  projects: typeof import("../../../src/services/projects.js");
  teamAssignments: typeof import("../../../src/services/teamAssignments.js");
  approvalFlows: typeof import("../../../src/services/approvalFlows.js");
  auth: typeof import("../../../src/services/auth.js");
  sessions: typeof import("../../../src/services/sessions.js");
  securityEvents: typeof import("../../../src/services/securityEvents.js");
  activityLogger: typeof import("../../../src/services/activityLogger.js");
};

let agent: ReturnType<typeof request>;
let actual: ActualModules;
let createWorkspaceFixture: (prefix?: string) => WorkspaceFixture;

function uniqueFixturePrefix(label: string): string {
  return `r${label.replace(/[^a-z]/g, "").slice(0, 4)}${Math.random().toString(36).slice(2, 10)}`;
}

function wireDefaults(): void {
  mocks.listTasks.mockImplementation(actual.tasks.listTasks);
  mocks.getTask.mockImplementation(actual.tasks.getTask);
  mocks.createTask.mockImplementation(actual.tasks.createTask);
  mocks.updateTask.mockImplementation(actual.tasks.updateTask);
  mocks.deleteTask.mockImplementation(actual.tasks.deleteTask);
  mocks.listTasksInWorkspace.mockImplementation(actual.tasks.listTasksInWorkspace);
  mocks.createTaskInWorkspace.mockImplementation(actual.tasks.createTaskInWorkspace);

  mocks.listIssues.mockImplementation(actual.issues.listIssues);
  mocks.listIssuesInWorkspace.mockImplementation(actual.issues.listIssuesInWorkspace);
  mocks.createIssueInWorkspace.mockImplementation(actual.issues.createIssueInWorkspace);
  mocks.getIssue.mockImplementation(actual.issues.getIssue);
  mocks.createIssue.mockImplementation(actual.issues.createIssue);
  mocks.updateIssue.mockImplementation(actual.issues.updateIssue);
  mocks.deleteIssue.mockImplementation(actual.issues.deleteIssue);

  mocks.listSubtasks.mockImplementation(actual.subtasks.listSubtasks);
  mocks.listSubtasksInWorkspace.mockImplementation(actual.subtasks.listSubtasksInWorkspace);
  mocks.createSubtaskInWorkspace.mockImplementation(actual.subtasks.createSubtaskInWorkspace);
  mocks.createSubtask.mockImplementation(actual.subtasks.createSubtask);
  mocks.updateSubtask.mockImplementation(actual.subtasks.updateSubtask);
  mocks.deleteSubtask.mockImplementation(actual.subtasks.deleteSubtask);

  mocks.listComments.mockImplementation(actual.comments.listComments);
  mocks.createComment.mockImplementation(actual.comments.createComment);
  mocks.deleteComment.mockImplementation(actual.comments.deleteComment);

  mocks.listNotifications.mockImplementation(actual.notifications.listNotifications);
  mocks.markNotificationRead.mockImplementation(actual.notifications.markNotificationRead);
  mocks.markAllNotificationsRead.mockImplementation(actual.notifications.markAllNotificationsRead);
  mocks.deleteNotification.mockImplementation(actual.notifications.deleteNotification);
  mocks.unreadCount.mockImplementation(actual.notifications.unreadCount);

  mocks.getSeverityStats.mockImplementation(actual.stats.getSeverityStats);
  mocks.getDashboardStats.mockImplementation(actual.stats.getDashboardStats);

  mocks.listFiles.mockImplementation(actual.files.listFiles);
  mocks.uploadCategorizedFile.mockImplementation(actual.files.uploadCategorizedFile);
  mocks.uploadUserAvatar.mockImplementation(actual.files.uploadUserAvatar);
  mocks.getUserAvatarPath.mockImplementation(actual.files.getUserAvatarPath);
  mocks.readFileContent.mockImplementation(actual.files.readFileContent);
  mocks.deleteFile.mockImplementation(actual.files.deleteFile);

  mocks.listTimeEntries.mockImplementation(actual.timeEntries.listTimeEntries);
  mocks.getTimeSummary.mockImplementation(actual.timeEntries.getTimeSummary);
  mocks.createTimeEntry.mockImplementation(actual.timeEntries.createTimeEntry);
  mocks.updateTimeEntry.mockImplementation(actual.timeEntries.updateTimeEntry);
  mocks.deleteTimeEntry.mockImplementation(actual.timeEntries.deleteTimeEntry);

  mocks.listWorkspacesWithMembership.mockImplementation(actual.workspaces.listWorkspacesWithMembership);
  mocks.getActiveWorkspace.mockImplementation(actual.workspaces.getActiveWorkspace);
  mocks.createWorkspace.mockImplementation(actual.workspaces.createWorkspace);
  mocks.getWorkspace.mockImplementation(actual.workspaces.getWorkspace);
  mocks.getWorkspacePermissions.mockImplementation(actual.workspaces.getWorkspacePermissions);
  mocks.activateWorkspace.mockImplementation(actual.workspaces.activateWorkspace);
  mocks.updateWorkspace.mockImplementation(actual.workspaces.updateWorkspace);
  mocks.deleteWorkspace.mockImplementation(actual.workspaces.deleteWorkspace);
  mocks.setApprovalFlowsEnabled.mockImplementation(actual.workspaces.setApprovalFlowsEnabled);

  mocks.getWorkspacePermissionMatrix.mockImplementation(actual.workspaceMembers.getWorkspacePermissionMatrix);
  mocks.listMembers.mockImplementation(actual.workspaceMembers.listMembers);
  mocks.getMemberWithPermissions.mockImplementation(actual.workspaceMembers.getMemberWithPermissions);
  mocks.changeMemberRole.mockImplementation(actual.workspaceMembers.changeMemberRole);
  mocks.removeMember.mockImplementation(actual.workspaceMembers.removeMember);
  mocks.updateMemberPermissions.mockImplementation(actual.workspaceMembers.updateMemberPermissions);
  mocks.resetMemberPermissions.mockImplementation(actual.workspaceMembers.resetMemberPermissions);
  mocks.createInvitation.mockImplementation(actual.workspaceMembers.createInvitation);
  mocks.listInvitations.mockImplementation(actual.workspaceMembers.listInvitations);
  mocks.resendInvitation.mockImplementation(actual.workspaceMembers.resendInvitation);
  mocks.revokeInvitation.mockImplementation(actual.workspaceMembers.revokeInvitation);
  mocks.getInvitationPreview.mockImplementation(actual.workspaceMembers.getInvitationPreview);
  mocks.listMyPendingInvitations.mockImplementation(actual.workspaceMembers.listMyPendingInvitations);
  mocks.acceptInvitation.mockImplementation(actual.workspaceMembers.acceptInvitation);
  mocks.rejectInvitation.mockImplementation(actual.workspaceMembers.rejectInvitation);

  mocks.createRole.mockImplementation(actual.workspaceRoles.createRole);
  mocks.renameRole.mockImplementation(actual.workspaceRoles.renameRole);
  mocks.deleteRole.mockImplementation(actual.workspaceRoles.deleteRole);
  mocks.updateRolePermissions.mockImplementation(actual.workspaceRoles.updateRolePermissions);
  mocks.updateRolePermissionEffects.mockImplementation(actual.workspaceRoles.updateRolePermissionEffects);
  mocks.resetRolePermissions.mockImplementation(actual.workspaceRoles.resetRolePermissions);
  mocks.cloneRole.mockImplementation(actual.workspaceRoles.cloneRole);
  mocks.getRoleWithPermissions.mockImplementation(actual.workspaceRoles.getRoleWithPermissions);

  mocks.listStatuses.mockImplementation(actual.workspaceStatuses.listStatuses);
  mocks.createStatus.mockImplementation(actual.workspaceStatuses.createStatus);
  mocks.updateStatus.mockImplementation(actual.workspaceStatuses.updateStatus);
  mocks.deleteStatus.mockImplementation(actual.workspaceStatuses.deleteStatus);

  mocks.listTeams.mockImplementation(actual.teams.listTeams);
  mocks.createTeam.mockImplementation(actual.teams.createTeam);
  mocks.getTeam.mockImplementation(actual.teams.getTeam);
  mocks.updateTeam.mockImplementation(actual.teams.updateTeam);
  mocks.deleteTeam.mockImplementation(actual.teams.deleteTeam);
  mocks.setTeamLead.mockImplementation(actual.teams.setTeamLead);
  mocks.addTeamMember.mockImplementation(actual.teams.addTeamMember);
  mocks.removeTeamMember.mockImplementation(actual.teams.removeTeamMember);

  mocks.listTeamJoinRequestsForLead.mockImplementation(actual.teamMembershipRequests.listTeamJoinRequestsForLead);
  mocks.getMyTeamJoinStatus.mockImplementation(actual.teamMembershipRequests.getMyTeamJoinStatus);
  mocks.requestTeamMembership.mockImplementation(actual.teamMembershipRequests.requestTeamMembership);
  mocks.approveTeamJoinRequest.mockImplementation(actual.teamMembershipRequests.approveTeamJoinRequest);
  mocks.rejectTeamJoinRequest.mockImplementation(actual.teamMembershipRequests.rejectTeamJoinRequest);
  mocks.listMyTeamJoinRequests.mockImplementation(actual.teamMembershipRequests.listMyTeamJoinRequests);

  mocks.listProjectSummaries.mockImplementation(actual.projects.listProjectSummaries);
  mocks.createProject.mockImplementation(actual.projects.createProject);
  mocks.getProject.mockImplementation(actual.projects.getProject);
  mocks.updateProject.mockImplementation(actual.projects.updateProject);
  mocks.deleteProject.mockImplementation(actual.projects.deleteProject);
  mocks.setProjectTeams.mockImplementation(actual.projects.setProjectTeams);
  mocks.addProjectMember.mockImplementation(actual.projects.addProjectMember);
  mocks.removeProjectMember.mockImplementation(actual.projects.removeProjectMember);
  mocks.setProjectLead.mockImplementation(actual.projects.setProjectLead);
  mocks.listProjectsForTeam.mockImplementation(actual.projects.listProjectsForTeam);
  mocks.getWorkspaceOverview.mockImplementation(actual.projects.getWorkspaceOverview);
  mocks.getMemberManagementSummary.mockImplementation(actual.projects.getMemberManagementSummary);

  mocks.listTeamAssignmentsForEntity.mockImplementation(actual.teamAssignments.listTeamAssignmentsForEntity);
  mocks.listTeamAssignmentsForTeam.mockImplementation(actual.teamAssignments.listTeamAssignmentsForTeam);
  mocks.assignTeamToEntity.mockImplementation(actual.teamAssignments.assignTeamToEntity);
  mocks.removeTeamFromEntity.mockImplementation(actual.teamAssignments.removeTeamFromEntity);

  mocks.listPendingApprovalsForDecider.mockImplementation(actual.approvalFlows.listPendingApprovalsForDecider);
  mocks.isApprovalFlowsEnabled.mockImplementation(actual.approvalFlows.isApprovalFlowsEnabled);
  mocks.listAllApprovals.mockImplementation(actual.approvalFlows.listAllApprovals);
  mocks.listMyApprovalRequests.mockImplementation(actual.approvalFlows.listMyApprovalRequests);
  mocks.createApprovalRequest.mockImplementation(actual.approvalFlows.createApprovalRequest);
  mocks.approveRequest.mockImplementation(actual.approvalFlows.approveRequest);
  mocks.rejectRequest.mockImplementation(actual.approvalFlows.rejectRequest);

  mocks.getUser.mockImplementation(actual.auth.getUser);
  mocks.listActiveSessions.mockImplementation(actual.sessions.listActiveSessions);
  mocks.listSecurityEvents.mockImplementation(actual.securityEvents.listSecurityEvents);
  mocks.activityList.mockImplementation(actual.activityLogger.ActivityLogger.list.bind(actual.activityLogger.ActivityLogger));
  mocks.activityForEntity.mockImplementation(
    actual.activityLogger.ActivityLogger.forEntity.bind(actual.activityLogger.ActivityLogger),
  );
}

async function createTask(owner: TestUser, workspaceId: string, title = "Route Error Task") {
  const res = await agent
    .post("/api/tasks")
    .set(authHeader(owner.accessToken))
    .send({ workspace_id: workspaceId, title })
    .expect(201);
  return res.body.task as { id: string };
}

async function createIssue(owner: TestUser, workspaceId: string, title = "Route Error Issue") {
  const res = await agent
    .post("/api/issues")
    .set(authHeader(owner.accessToken))
    .send({ workspace_id: workspaceId, title })
    .expect(201);
  return res.body.issue as { id: string };
}

async function createSubtask(owner: TestUser, workspaceId: string, taskId: string, title = "Route Error Subtask") {
  const res = await agent
    .post("/api/subtasks")
    .set(authHeader(owner.accessToken))
    .send({ workspace_id: workspaceId, task_id: taskId, title })
    .expect(201);
  return res.body.subtask as { id: string };
}

async function createCollabTeam(owner: TestUser, workspaceId: string, name = "Route Error Team") {
  const res = await agent
    .post(wsPath(workspaceId, "/teams"))
    .set(authHeader(owner.accessToken))
    .send({ name })
    .expect(201);
  return res.body.team as { id: string };
}

async function createCollabProject(owner: TestUser, workspaceId: string, name = "Route Error Project") {
  const res = await agent
    .post(wsPath(workspaceId, "/projects"))
    .set(authHeader(owner.accessToken))
    .send({ name })
    .expect(201);
  return res.body.project as { id: string };
}

async function createCollabStatus(owner: TestUser, workspaceId: string) {
  const res = await agent
    .post(wsPath(workspaceId, "/statuses"))
    .set(authHeader(owner.accessToken))
    .send({ entity_type: "task", label: "Err Status", color: "#112233" })
    .expect(201);
  return res.body.status as { id: string };
}

async function createCollabRole(owner: TestUser, workspaceId: string, name = "Err Role") {
  const res = await agent
    .post(wsPath(workspaceId, "/roles"))
    .set(authHeader(owner.accessToken))
    .send({ name, permissions: ["task.view"] })
    .expect(201);
  return res.body.role as { id: string };
}

async function getOwnerMemberId(owner: TestUser, workspaceId: string): Promise<string> {
  const res = await agent
    .get(wsPath(workspaceId, "/members"))
    .set(authHeader(owner.accessToken))
    .expect(200);
  const row = res.body.members.find((m: { user_id: string }) => m.user_id === owner.id);
  return row.id as string;
}

describe("route catch blocks", () => {
  beforeAll(async () => {
    jest.resetModules();
    const { initDb } = await import("../../../src/db.js");
    initDb({ seedDemo: false });

    actual = {
      tasks: await import("../../../src/services/tasks.js"),
      issues: await import("../../../src/services/issues.js"),
      subtasks: await import("../../../src/services/subtasks.js"),
      comments: await import("../../../src/services/comments.js"),
      notifications: await import("../../../src/services/notifications.js"),
      stats: await import("../../../src/services/stats.js"),
      files: await import("../../../src/services/files.js"),
      timeEntries: await import("../../../src/services/timeEntries.js"),
      workspaces: await import("../../../src/services/workspaces.js"),
      workspaceMembers: await import("../../../src/services/workspaceMembers.js"),
      workspaceRoles: await import("../../../src/services/workspaceRoles.js"),
      workspaceStatuses: await import("../../../src/services/workspaceStatuses.js"),
      teams: await import("../../../src/services/teams.js"),
      teamMembershipRequests: await import("../../../src/services/teamMembershipRequests.js"),
      projects: await import("../../../src/services/projects.js"),
      teamAssignments: await import("../../../src/services/teamAssignments.js"),
      approvalFlows: await import("../../../src/services/approvalFlows.js"),
      auth: await import("../../../src/services/auth.js"),
      sessions: await import("../../../src/services/sessions.js"),
      securityEvents: await import("../../../src/services/securityEvents.js"),
      activityLogger: await import("../../../src/services/activityLogger.js"),
    };
    wireDefaults();

    await jest.unstable_mockModule("../../../src/services/tasks.js", () => ({
      ...actual.tasks,
      listTasks: mocks.listTasks,
      getTask: mocks.getTask,
      createTask: mocks.createTask,
      updateTask: mocks.updateTask,
      deleteTask: mocks.deleteTask,
      listTasksInWorkspace: mocks.listTasksInWorkspace,
      createTaskInWorkspace: mocks.createTaskInWorkspace,
    }));
    await jest.unstable_mockModule("../../../src/services/issues.js", () => ({
      ...actual.issues,
      listIssues: mocks.listIssues,
      listIssuesInWorkspace: mocks.listIssuesInWorkspace,
      createIssueInWorkspace: mocks.createIssueInWorkspace,
      getIssue: mocks.getIssue,
      createIssue: mocks.createIssue,
      updateIssue: mocks.updateIssue,
      deleteIssue: mocks.deleteIssue,
    }));
    await jest.unstable_mockModule("../../../src/services/subtasks.js", () => ({
      ...actual.subtasks,
      listSubtasks: mocks.listSubtasks,
      listSubtasksInWorkspace: mocks.listSubtasksInWorkspace,
      createSubtaskInWorkspace: mocks.createSubtaskInWorkspace,
      createSubtask: mocks.createSubtask,
      updateSubtask: mocks.updateSubtask,
      deleteSubtask: mocks.deleteSubtask,
    }));
    await jest.unstable_mockModule("../../../src/services/comments.js", () => ({
      ...actual.comments,
      listComments: mocks.listComments,
      createComment: mocks.createComment,
      deleteComment: mocks.deleteComment,
    }));
    await jest.unstable_mockModule("../../../src/services/notifications.js", () => ({
      ...actual.notifications,
      listNotifications: mocks.listNotifications,
      markNotificationRead: mocks.markNotificationRead,
      markAllNotificationsRead: mocks.markAllNotificationsRead,
      deleteNotification: mocks.deleteNotification,
      unreadCount: mocks.unreadCount,
      notify: actual.notifications.notify,
    }));
    await jest.unstable_mockModule("../../../src/services/stats.js", () => ({
      ...actual.stats,
      getSeverityStats: mocks.getSeverityStats,
      getDashboardStats: mocks.getDashboardStats,
    }));
    await jest.unstable_mockModule("../../../src/services/files.js", () => ({
      ...actual.files,
      listFiles: mocks.listFiles,
      uploadCategorizedFile: mocks.uploadCategorizedFile,
      uploadUserAvatar: mocks.uploadUserAvatar,
      getUserAvatarPath: mocks.getUserAvatarPath,
      readFileContent: mocks.readFileContent,
      deleteFile: mocks.deleteFile,
    }));
    await jest.unstable_mockModule("../../../src/services/timeEntries.js", () => ({
      ...actual.timeEntries,
      listTimeEntries: mocks.listTimeEntries,
      getTimeSummary: mocks.getTimeSummary,
      createTimeEntry: mocks.createTimeEntry,
      updateTimeEntry: mocks.updateTimeEntry,
      deleteTimeEntry: mocks.deleteTimeEntry,
    }));
    await jest.unstable_mockModule("../../../src/services/workspaces.js", () => ({
      ...actual.workspaces,
      listWorkspacesWithMembership: mocks.listWorkspacesWithMembership,
      getActiveWorkspace: mocks.getActiveWorkspace,
      createWorkspace: mocks.createWorkspace,
      getWorkspace: mocks.getWorkspace,
      getWorkspacePermissions: mocks.getWorkspacePermissions,
      activateWorkspace: mocks.activateWorkspace,
      updateWorkspace: mocks.updateWorkspace,
      deleteWorkspace: mocks.deleteWorkspace,
      setApprovalFlowsEnabled: mocks.setApprovalFlowsEnabled,
    }));
    await jest.unstable_mockModule("../../../src/services/workspaceMembers.js", () => ({
      ...actual.workspaceMembers,
      getWorkspacePermissionMatrix: mocks.getWorkspacePermissionMatrix,
      listMembers: mocks.listMembers,
      getMemberWithPermissions: mocks.getMemberWithPermissions,
      changeMemberRole: mocks.changeMemberRole,
      removeMember: mocks.removeMember,
      updateMemberPermissions: mocks.updateMemberPermissions,
      resetMemberPermissions: mocks.resetMemberPermissions,
      createInvitation: mocks.createInvitation,
      listInvitations: mocks.listInvitations,
      resendInvitation: mocks.resendInvitation,
      revokeInvitation: mocks.revokeInvitation,
      getInvitationPreview: mocks.getInvitationPreview,
      listMyPendingInvitations: mocks.listMyPendingInvitations,
      acceptInvitation: mocks.acceptInvitation,
      rejectInvitation: mocks.rejectInvitation,
    }));
    await jest.unstable_mockModule("../../../src/services/workspaceRoles.js", () => ({
      ...actual.workspaceRoles,
      createRole: mocks.createRole,
      renameRole: mocks.renameRole,
      deleteRole: mocks.deleteRole,
      updateRolePermissions: mocks.updateRolePermissions,
      updateRolePermissionEffects: mocks.updateRolePermissionEffects,
      resetRolePermissions: mocks.resetRolePermissions,
      cloneRole: mocks.cloneRole,
      getRoleWithPermissions: mocks.getRoleWithPermissions,
    }));
    await jest.unstable_mockModule("../../../src/services/workspaceStatuses.js", () => ({
      ...actual.workspaceStatuses,
      listStatuses: mocks.listStatuses,
      createStatus: mocks.createStatus,
      updateStatus: mocks.updateStatus,
      deleteStatus: mocks.deleteStatus,
    }));
    await jest.unstable_mockModule("../../../src/services/teams.js", () => ({
      ...actual.teams,
      listTeams: mocks.listTeams,
      createTeam: mocks.createTeam,
      getTeam: mocks.getTeam,
      updateTeam: mocks.updateTeam,
      deleteTeam: mocks.deleteTeam,
      setTeamLead: mocks.setTeamLead,
      addTeamMember: mocks.addTeamMember,
      removeTeamMember: mocks.removeTeamMember,
    }));
    await jest.unstable_mockModule("../../../src/services/teamMembershipRequests.js", () => ({
      ...actual.teamMembershipRequests,
      listTeamJoinRequestsForLead: mocks.listTeamJoinRequestsForLead,
      getMyTeamJoinStatus: mocks.getMyTeamJoinStatus,
      requestTeamMembership: mocks.requestTeamMembership,
      approveTeamJoinRequest: mocks.approveTeamJoinRequest,
      rejectTeamJoinRequest: mocks.rejectTeamJoinRequest,
      listMyTeamJoinRequests: mocks.listMyTeamJoinRequests,
    }));
    await jest.unstable_mockModule("../../../src/services/projects.js", () => ({
      ...actual.projects,
      listProjectSummaries: mocks.listProjectSummaries,
      createProject: mocks.createProject,
      getProject: mocks.getProject,
      updateProject: mocks.updateProject,
      deleteProject: mocks.deleteProject,
      setProjectTeams: mocks.setProjectTeams,
      addProjectMember: mocks.addProjectMember,
      removeProjectMember: mocks.removeProjectMember,
      setProjectLead: mocks.setProjectLead,
      listProjectsForTeam: mocks.listProjectsForTeam,
      getWorkspaceOverview: mocks.getWorkspaceOverview,
      getMemberManagementSummary: mocks.getMemberManagementSummary,
    }));
    await jest.unstable_mockModule("../../../src/services/teamAssignments.js", () => ({
      ...actual.teamAssignments,
      listTeamAssignmentsForEntity: mocks.listTeamAssignmentsForEntity,
      listTeamAssignmentsForTeam: mocks.listTeamAssignmentsForTeam,
      assignTeamToEntity: mocks.assignTeamToEntity,
      removeTeamFromEntity: mocks.removeTeamFromEntity,
    }));
    await jest.unstable_mockModule("../../../src/services/approvalFlows.js", () => ({
      ...actual.approvalFlows,
      listPendingApprovalsForDecider: mocks.listPendingApprovalsForDecider,
      isApprovalFlowsEnabled: mocks.isApprovalFlowsEnabled,
      listAllApprovals: mocks.listAllApprovals,
      listMyApprovalRequests: mocks.listMyApprovalRequests,
      createApprovalRequest: mocks.createApprovalRequest,
      approveRequest: mocks.approveRequest,
      rejectRequest: mocks.rejectRequest,
    }));
    await jest.unstable_mockModule("../../../src/services/auth.js", () => ({
      ...actual.auth,
      getUser: mocks.getUser,
    }));
    await jest.unstable_mockModule("../../../src/services/sessions.js", () => ({
      ...actual.sessions,
      listActiveSessions: mocks.listActiveSessions,
    }));
    await jest.unstable_mockModule("../../../src/services/securityEvents.js", () => ({
      ...actual.securityEvents,
      listSecurityEvents: mocks.listSecurityEvents,
    }));
    await jest.unstable_mockModule("../../../src/services/activityLogger.js", () => {
      class MockActivityLogger extends actual.activityLogger.ActivityLogger {
        static list = mocks.activityList;
        static forEntity = mocks.activityForEntity;
      }
      return { ...actual.activityLogger, ActivityLogger: MockActivityLogger };
    });

    const { createApp } = await import("../../../src/app.js");
    agent = request(createApp() as Express);

    ({ createWorkspaceFixture } = await import("../../setup/fixtures.js"));
  });

  afterAll(async () => {
    jest.resetModules();
    const { initDb } = await import("../../../src/db.js");
    initDb({ seedDemo: false });
  });

  afterEach(() => {
    wireDefaults();
  });

  describe("tasks routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("tasks"));
    });

    it("returns 400 when listTasks throws", async () => {
      mocks.listTasks.mockImplementation(serviceError);
      await agent
        .get("/api/tasks")
        .query({ workspace_id: fixture.id })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getTask throws", async () => {
      const task = await createTask(fixture.owner, fixture.id);
      mocks.getTask.mockImplementation(serviceError);
      await agent
        .get(`/api/tasks/${task.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 404 when getTask returns undefined", async () => {
      const task = await createTask(fixture.owner, fixture.id);
      mocks.getTask.mockReturnValue(undefined);
      await agent
        .get(`/api/tasks/${task.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 404 when getTask returns undefined for activity", async () => {
      const task = await createTask(fixture.owner, fixture.id);
      mocks.getTask.mockReturnValue(undefined);
      await agent
        .get(`/api/tasks/${task.id}/activity`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 400 when task activity throws", async () => {
      const task = await createTask(fixture.owner, fixture.id);
      mocks.activityForEntity.mockImplementation(serviceError);
      await agent
        .get(`/api/tasks/${task.id}/activity`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createTask throws", async () => {
      mocks.createTask.mockImplementation(serviceError);
      await agent
        .post("/api/tasks")
        .set(authHeader(fixture.owner.accessToken))
        .send({ workspace_id: fixture.id, title: "Fail" })
        .expect(400);
    });

    it("returns 400 when updateTask throws", async () => {
      const task = await createTask(fixture.owner, fixture.id);
      mocks.updateTask.mockImplementation(serviceError);
      await agent
        .patch(`/api/tasks/${task.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Fail" })
        .expect(400);
    });

    it("returns 400 when deleteTask throws", async () => {
      const task = await createTask(fixture.owner, fixture.id);
      mocks.deleteTask.mockImplementation(serviceError);
      await agent
        .delete(`/api/tasks/${task.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("issues routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("issues"));
    });

    it("returns 400 when listIssues throws", async () => {
      mocks.listIssues.mockImplementation(serviceError);
      await agent
        .get("/api/issues")
        .query({ workspace_id: fixture.id })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getIssue throws", async () => {
      const issue = await createIssue(fixture.owner, fixture.id);
      mocks.getIssue.mockImplementation(serviceError);
      await agent
        .get(`/api/issues/${issue.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 404 when getIssue returns undefined", async () => {
      const issue = await createIssue(fixture.owner, fixture.id);
      mocks.getIssue.mockReturnValue(undefined);
      await agent
        .get(`/api/issues/${issue.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 404 when getIssue returns undefined for activity", async () => {
      const issue = await createIssue(fixture.owner, fixture.id);
      mocks.getIssue.mockReturnValue(undefined);
      await agent
        .get(`/api/issues/${issue.id}/activity`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 400 when issue activity throws", async () => {
      const issue = await createIssue(fixture.owner, fixture.id);
      mocks.activityForEntity.mockImplementation(serviceError);
      await agent
        .get(`/api/issues/${issue.id}/activity`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createIssue throws", async () => {
      mocks.createIssue.mockImplementation(serviceError);
      await agent
        .post("/api/issues")
        .set(authHeader(fixture.owner.accessToken))
        .send({ workspace_id: fixture.id, title: "Fail" })
        .expect(400);
    });

    it("returns 400 when updateIssue throws", async () => {
      const issue = await createIssue(fixture.owner, fixture.id);
      mocks.updateIssue.mockImplementation(serviceError);
      await agent
        .patch(`/api/issues/${issue.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Fail" })
        .expect(400);
    });

    it("returns 400 when deleteIssue throws", async () => {
      const issue = await createIssue(fixture.owner, fixture.id);
      mocks.deleteIssue.mockImplementation(serviceError);
      await agent
        .delete(`/api/issues/${issue.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("subtasks routes", () => {
    let fixture: WorkspaceFixture;
    let taskId: string;

    beforeEach(async () => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("subtasks"));
      taskId = (await createTask(fixture.owner, fixture.id)).id;
    });

    it("returns 400 when listSubtasks throws", async () => {
      mocks.listSubtasks.mockImplementation(serviceError);
      await agent
        .get("/api/subtasks")
        .query({ workspace_id: fixture.id, task_id: taskId })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createSubtask throws", async () => {
      mocks.createSubtask.mockImplementation(serviceError);
      await agent
        .post("/api/subtasks")
        .set(authHeader(fixture.owner.accessToken))
        .send({ workspace_id: fixture.id, task_id: taskId, title: "Fail" })
        .expect(400);
    });

    it("returns 400 when updateSubtask throws", async () => {
      const subtask = await createSubtask(fixture.owner, fixture.id, taskId);
      mocks.updateSubtask.mockImplementation(serviceError);
      await agent
        .patch(`/api/subtasks/${subtask.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Fail" })
        .expect(400);
    });

    it("returns 400 when deleteSubtask throws", async () => {
      const subtask = await createSubtask(fixture.owner, fixture.id, taskId);
      mocks.deleteSubtask.mockImplementation(serviceError);
      await agent
        .delete(`/api/subtasks/${subtask.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("comments routes", () => {
    let fixture: WorkspaceFixture;
    let taskId: string;

    beforeEach(async () => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("comments"));
      taskId = (await createTask(fixture.owner, fixture.id)).id;
    });

    it("returns 400 when listComments throws", async () => {
      mocks.listComments.mockImplementation(serviceError);
      await agent
        .get("/api/comments")
        .query({ entity_type: "task", entity_id: taskId })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createComment throws", async () => {
      mocks.createComment.mockImplementation(serviceError);
      await agent
        .post("/api/comments")
        .set(authHeader(fixture.owner.accessToken))
        .send({ workspace_id: fixture.id, entity_type: "task", entity_id: taskId, body: "Fail" })
        .expect(400);
    });

    it("returns 400 when deleteComment throws", async () => {
      const createRes = await agent
        .post("/api/comments")
        .set(authHeader(fixture.owner.accessToken))
        .send({ workspace_id: fixture.id, entity_type: "task", entity_id: taskId, body: "Delete me" })
        .expect(201);
      mocks.deleteComment.mockImplementation(serviceError);
      await agent
        .delete(`/api/comments/${createRes.body.comment.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("notifications routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("notif"));
    });

    it("returns 400 when listNotifications throws", async () => {
      mocks.listNotifications.mockImplementation(serviceError);
      await agent
        .get("/api/notifications")
        .query({ workspace_id: fixture.id })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when markNotificationRead throws", async () => {
      const notification = actual.notifications.notify({
        userId: fixture.owner.id,
        type: "info",
        title: "Read fail",
        message: "Test",
        workspaceId: fixture.id,
      });
      mocks.markNotificationRead.mockImplementation(serviceError);
      await agent
        .patch(`/api/notifications/${notification.id}/read`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when markAllNotificationsRead throws", async () => {
      mocks.markAllNotificationsRead.mockImplementation(serviceError);
      await agent
        .post("/api/notifications/read-all")
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when read-all via PUT throws", async () => {
      mocks.markAllNotificationsRead.mockImplementation(serviceError);
      await agent
        .put("/api/notifications/read-all")
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when deleteNotification throws", async () => {
      const notification = actual.notifications.notify({
        userId: fixture.owner.id,
        type: "info",
        title: "Delete fail",
        message: "Test",
        workspaceId: fixture.id,
      });
      mocks.deleteNotification.mockImplementation(serviceError);
      await agent
        .delete(`/api/notifications/${notification.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 404 when deleteNotification returns false", async () => {
      mocks.deleteNotification.mockReturnValue(false);
      await agent
        .delete("/api/notifications/00000000-0000-4000-8000-000000000099")
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });
  });

  describe("activityLogs routes", () => {
    it("returns 400 when ActivityLogger.list throws", async () => {
      const { id, owner } = createWorkspaceFixture(uniqueFixturePrefix("act"));
      mocks.activityList.mockImplementation(serviceError);
      await agent
        .get("/api/activity-logs")
        .query({ workspace_id: id })
        .set(authHeader(owner.accessToken))
        .expect(400);
    });
  });

  describe("stats routes", () => {
    it("returns 400 when getSeverityStats throws", async () => {
      const { id, owner } = createWorkspaceFixture(uniqueFixturePrefix("stats_sev"));
      mocks.getSeverityStats.mockImplementation(serviceError);
      await agent
        .get("/api/stats/severity")
        .query({ workspace_id: id })
        .set(authHeader(owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getDashboardStats throws", async () => {
      const { id, owner } = createWorkspaceFixture(uniqueFixturePrefix("stats_dash"));
      mocks.getDashboardStats.mockImplementation(serviceError);
      await agent
        .get("/api/stats/dashboard")
        .query({ workspace_id: id })
        .set(authHeader(owner.accessToken))
        .expect(400);
    });
  });

  describe("security routes", () => {
    it("returns 400 when listSecurityEvents throws", async () => {
      const { id, owner } = createWorkspaceFixture(uniqueFixturePrefix("sec"));
      mocks.listSecurityEvents.mockImplementation(serviceError);
      await agent
        .get(`/api/security/workspaces/${id}/events`)
        .set(authHeader(owner.accessToken))
        .expect(400);
    });
  });

  describe("files routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("files"));
    });

    it("returns 400 when listFiles throws", async () => {
      mocks.listFiles.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/files"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when uploadCategorizedFile throws", async () => {
      mocks.uploadCategorizedFile.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/files/upload"))
        .set(authHeader(fixture.owner.accessToken))
        .attach("file", Buffer.from("data"), { filename: "x.txt", contentType: "text/plain" })
        .field("category", "general")
        .expect(400);
    });

    it("returns 400 when upload lacks entity_id for non-general category", async () => {
      await agent
        .post(wsPath(fixture.id, "/files/upload"))
        .set(authHeader(fixture.owner.accessToken))
        .attach("file", Buffer.from("data"), { filename: "task.txt", contentType: "text/plain" })
        .field("category", "task")
        .expect(400);
    });

    it("returns 400 when readFileContent throws", async () => {
      const uploadRes = await agent
        .post(wsPath(fixture.id, "/files/upload"))
        .set(authHeader(fixture.owner.accessToken))
        .attach("file", Buffer.from("data"), { filename: "y.txt", contentType: "text/plain" })
        .field("category", "general")
        .expect(201);
      mocks.readFileContent.mockImplementation(serviceError);
      await agent
        .get(`/api/files/${uploadRes.body.file.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when deleteFile throws", async () => {
      const uploadRes = await agent
        .post(wsPath(fixture.id, "/files/upload"))
        .set(authHeader(fixture.owner.accessToken))
        .attach("file", Buffer.from("data"), { filename: "z.txt", contentType: "text/plain" })
        .field("category", "general")
        .expect(201);
      mocks.deleteFile.mockImplementation(serviceError);
      await agent
        .delete(`/api/files/${uploadRes.body.file.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("timeEntries routes", () => {
    let fixture: WorkspaceFixture;
    let taskId: string;

    beforeEach(async () => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("time"));
      const taskRes = await agent
        .post(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Time parent" })
        .expect(201);
      taskId = taskRes.body.task.id as string;
    });

    it("returns 400 when listTimeEntries throws", async () => {
      mocks.listTimeEntries.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/time-entries"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getTimeSummary throws", async () => {
      mocks.getTimeSummary.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/time-entries/summary"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createTimeEntry throws", async () => {
      mocks.createTimeEntry.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/time-entries"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ entity_type: "task", entity_id: taskId, work_date: "2026-03-01", hours: 1 })
        .expect(400);
    });

    it("returns 400 when updateTimeEntry throws", async () => {
      const createRes = await agent
        .post(wsPath(fixture.id, "/time-entries"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ entity_type: "task", entity_id: taskId, work_date: "2026-03-01", hours: 1 })
        .expect(201);
      mocks.updateTimeEntry.mockImplementation(serviceError);
      await agent
        .patch(wsPath(fixture.id, `/time-entries/${createRes.body.entry.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ hours: 2 })
        .expect(400);
    });

    it("returns 400 when deleteTimeEntry throws", async () => {
      const createRes = await agent
        .post(wsPath(fixture.id, "/time-entries"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ entity_type: "task", entity_id: taskId, work_date: "2026-03-01", hours: 1 })
        .expect(201);
      mocks.deleteTimeEntry.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/time-entries/${createRes.body.entry.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("workspaces routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("ws"));
    });

    it("returns 400 when listWorkspacesWithMembership throws", async () => {
      mocks.listWorkspacesWithMembership.mockImplementation(serviceError);
      await agent.get("/api/workspaces").set(authHeader(fixture.owner.accessToken)).expect(400);
    });

    it("returns 400 when getActiveWorkspace throws", async () => {
      mocks.getActiveWorkspace.mockImplementation(serviceError);
      await agent.get("/api/workspaces").set(authHeader(fixture.owner.accessToken)).expect(400);
    });

    it("returns 400 when createWorkspace throws", async () => {
      mocks.createWorkspace.mockImplementation(serviceError);
      await agent
        .post("/api/workspaces")
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Fail WS" })
        .expect(400);
    });

    it("returns 400 when createWorkspace lacks name", async () => {
      await agent
        .post("/api/workspaces")
        .set(authHeader(fixture.owner.accessToken))
        .send({ description: "No name" })
        .expect(400);
    });

    it("returns 400 when getWorkspace throws", async () => {
      mocks.getWorkspace.mockImplementation(serviceError);
      await agent
        .get(`/api/workspaces/${fixture.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getWorkspacePermissions throws", async () => {
      mocks.getWorkspacePermissions.mockImplementation(serviceError);
      await agent
        .get(`/api/workspaces/${fixture.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 404 when getWorkspace returns undefined", async () => {
      mocks.getWorkspace.mockReturnValue(undefined);
      await agent
        .get(`/api/workspaces/${fixture.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 400 when activateWorkspace throws", async () => {
      mocks.activateWorkspace.mockImplementation(serviceError);
      await agent
        .post(`/api/workspaces/${fixture.id}/activate`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when updateWorkspace throws", async () => {
      mocks.updateWorkspace.mockImplementation(serviceError);
      await agent
        .patch(`/api/workspaces/${fixture.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Fail rename" })
        .expect(400);
    });

    it("returns 400 when deleteWorkspace throws", async () => {
      mocks.deleteWorkspace.mockImplementation(serviceError);
      await agent
        .delete(`/api/workspaces/${fixture.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 204 when deleteWorkspace succeeds", async () => {
      mocks.deleteWorkspace.mockImplementation(() => {});
      await agent
        .delete(`/api/workspaces/${fixture.id}`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(204);
    });

    it("returns 400 when setApprovalFlowsEnabled throws", async () => {
      mocks.setApprovalFlowsEnabled.mockImplementation(serviceError);
      await agent
        .patch(`/api/workspaces/${fixture.id}/approval-flows`)
        .set(authHeader(fixture.owner.accessToken))
        .send({ enabled: false })
        .expect(400);
    });

    it("returns 404 when approval-flows patch finds no workspace", async () => {
      mocks.getWorkspace.mockReturnValue(undefined);
      await agent
        .patch(`/api/workspaces/${fixture.id}/approval-flows`)
        .set(authHeader(fixture.owner.accessToken))
        .send({ enabled: false })
        .expect(404);
    });

    it("returns 400 when workspace activity throws", async () => {
      mocks.activityList.mockImplementation(serviceError);
      await agent
        .get(`/api/workspaces/${fixture.id}/activity`)
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });
  });

  describe("workspaceCollaboration routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("collab"));
    });

    it("returns 400 when getWorkspacePermissionMatrix throws", async () => {
      mocks.getWorkspacePermissionMatrix.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/permissions"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createRole throws", async () => {
      mocks.createRole.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/roles"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Fail Role", permissions: ["task.view"] })
        .expect(400);
    });

    it("returns 400 when listPendingApprovalsForDecider throws", async () => {
      mocks.listPendingApprovalsForDecider.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/approvals/pending"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when workspace-scoped listTasks throws", async () => {
      mocks.listTasksInWorkspace.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createInvitation throws", async () => {
      mocks.createInvitation.mockImplementation(serviceError);
      const devRole = actual.workspaceRoles.getRoleBySlug(fixture.id, "developer")!;
      await agent
        .post(wsPath(fixture.id, "/invitations"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ email: "invite-fail@test.local", role_id: devRole.id })
        .expect(400);
    });

    it("returns 400 when listStatuses throws", async () => {
      mocks.listStatuses.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/statuses"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createStatus throws", async () => {
      mocks.createStatus.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/statuses"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ entity_type: "task", label: "Fail", color: "#ff0000" })
        .expect(400);
    });

    it("returns 400 when updateStatus throws", async () => {
      const status = await createCollabStatus(fixture.owner, fixture.id);
      mocks.updateStatus.mockImplementation(serviceError);
      await agent
        .patch(wsPath(fixture.id, `/statuses/${status.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ label: "Fail" })
        .expect(400);
    });

    it("returns 400 when deleteStatus throws", async () => {
      const status = await createCollabStatus(fixture.owner, fixture.id);
      mocks.deleteStatus.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/statuses/${status.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when renameRole throws", async () => {
      const role = await createCollabRole(fixture.owner, fixture.id);
      mocks.renameRole.mockImplementation(serviceError);
      await agent
        .patch(wsPath(fixture.id, `/roles/${role.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Renamed Fail" })
        .expect(400);
    });

    it("returns 400 when deleteRole throws", async () => {
      const role = await createCollabRole(fixture.owner, fixture.id);
      mocks.deleteRole.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/roles/${role.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when updateRolePermissions throws", async () => {
      const role = await createCollabRole(fixture.owner, fixture.id);
      mocks.updateRolePermissions.mockImplementation(serviceError);
      await agent
        .put(wsPath(fixture.id, `/roles/${role.id}/permissions`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ permissions: ["task.view", "task.create"] })
        .expect(400);
    });

    it("returns 400 when resetRolePermissions throws", async () => {
      const role = await createCollabRole(fixture.owner, fixture.id);
      mocks.resetRolePermissions.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/roles/${role.id}/reset`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when cloneRole throws", async () => {
      const role = await createCollabRole(fixture.owner, fixture.id);
      mocks.cloneRole.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/roles/${role.id}/clone`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Cloned Fail" })
        .expect(400);
    });

    it("returns 400 when listMembers throws", async () => {
      mocks.listMembers.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/members"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getMemberWithPermissions throws", async () => {
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.getMemberWithPermissions.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/members/${memberId}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when changeMemberRole throws", async () => {
      const memberRowId = await getOwnerMemberId(fixture.owner, fixture.id);
      const viewerRole = actual.workspaceRoles.getRoleBySlug(fixture.id, "viewer")!;
      mocks.changeMemberRole.mockImplementation(serviceError);
      await agent
        .patch(wsPath(fixture.id, `/members/${memberRowId}/role`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ role_id: viewerRole.id })
        .expect(400);
    });

    it("returns 400 when updateMemberPermissions throws", async () => {
      const memberRowId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.updateMemberPermissions.mockImplementation(serviceError);
      await agent
        .put(wsPath(fixture.id, `/members/${memberRowId}/permissions`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ overrides: [{ permission_code: "task.view", effect: "grant" }] })
        .expect(400);
    });

    it("returns 400 when resetMemberPermissions throws", async () => {
      const memberRowId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.resetMemberPermissions.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/members/${memberRowId}/permissions/reset`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when removeMember throws", async () => {
      const memberRowId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.removeMember.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/members/${memberRowId}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listTeams throws", async () => {
      mocks.listTeams.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/teams"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createTeam throws", async () => {
      mocks.createTeam.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/teams"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Fail Team" })
        .expect(400);
    });

    it("returns 400 when getTeam throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.getTeam.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/teams/${team.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when updateTeam throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.updateTeam.mockImplementation(serviceError);
      await agent
        .patch(wsPath(fixture.id, `/teams/${team.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ description: "Fail" })
        .expect(400);
    });

    it("returns 400 when deleteTeam throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.deleteTeam.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/teams/${team.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when setTeamLead throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.setTeamLead.mockImplementation(serviceError);
      await agent
        .put(wsPath(fixture.id, `/teams/${team.id}/lead`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ member_id: memberId })
        .expect(400);
    });

    it("returns 400 when addTeamMember throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.addTeamMember.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/teams/${team.id}/members`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ member_id: memberId })
        .expect(400);
    });

    it("returns 400 when removeTeamMember throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      await agent
        .post(wsPath(fixture.id, `/teams/${team.id}/members`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ member_id: memberId })
        .expect(200);
      mocks.removeTeamMember.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/teams/${team.id}/members/${memberId}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listTeamJoinRequestsForLead throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.listTeamJoinRequestsForLead.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/teams/${team.id}/join-requests`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getMyTeamJoinStatus throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.getMyTeamJoinStatus.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/teams/${team.id}/my-join-status`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when requestTeamMembership throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.requestTeamMembership.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/teams/${team.id}/join-requests`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ reason: "Fail" })
        .expect(400);
    });

    it("returns 400 when approveTeamJoinRequest throws", async () => {
      mocks.approveTeamJoinRequest.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/team-join-requests/00000000-0000-4000-8000-000000000001/approve"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when rejectTeamJoinRequest throws", async () => {
      mocks.rejectTeamJoinRequest.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/team-join-requests/00000000-0000-4000-8000-000000000002/reject"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ reason: "Fail" })
        .expect(400);
    });

    it("returns 400 when listMyTeamJoinRequests throws", async () => {
      mocks.listMyTeamJoinRequests.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/team-join-requests/mine"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getWorkspaceOverview throws", async () => {
      mocks.getWorkspaceOverview.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/overview"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when getMemberManagementSummary throws", async () => {
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.getMemberManagementSummary.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/members/${memberId}/summary`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listProjectSummaries throws", async () => {
      mocks.listProjectSummaries.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/projects"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createProject throws", async () => {
      mocks.createProject.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/projects"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Fail Project" })
        .expect(400);
    });

    it("returns 400 when getProject throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      mocks.getProject.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/projects/${project.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when updateProject throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      mocks.updateProject.mockImplementation(serviceError);
      await agent
        .patch(wsPath(fixture.id, `/projects/${project.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ name: "Fail Rename" })
        .expect(400);
    });

    it("returns 400 when deleteProject throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      mocks.deleteProject.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/projects/${project.id}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when setProjectTeams throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.setProjectTeams.mockImplementation(serviceError);
      await agent
        .put(wsPath(fixture.id, `/projects/${project.id}/teams`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ team_ids: [team.id] })
        .expect(400);
    });

    it("returns 400 when addProjectMember throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.addProjectMember.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/projects/${project.id}/members`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ member_id: memberId })
        .expect(400);
    });

    it("returns 400 when removeProjectMember throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      await agent
        .post(wsPath(fixture.id, `/projects/${project.id}/members`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ member_id: memberId })
        .expect(200);
      mocks.removeProjectMember.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, `/projects/${project.id}/members/${memberId}`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when setProjectLead throws", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      mocks.setProjectLead.mockImplementation(serviceError);
      await agent
        .put(wsPath(fixture.id, `/projects/${project.id}/lead`))
        .set(authHeader(fixture.owner.accessToken))
        .send({ member_id: memberId })
        .expect(400);
    });

    it("returns 400 when listProjectsForTeam throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.listProjectsForTeam.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, `/teams/${team.id}/projects`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listTeamAssignmentsForEntity throws", async () => {
      const task = await agent
        .post(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Assign Fail" })
        .expect(201);
      mocks.listTeamAssignmentsForEntity.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/team-assignments"))
        .query({ entity_type: "task", entity_id: task.body.task.id })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listTeamAssignmentsForTeam throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      mocks.listTeamAssignmentsForTeam.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/team-assignments"))
        .query({ team_id: team.id })
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when assignTeamToEntity throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      const task = await agent
        .post(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Assign Fail" })
        .expect(201);
      mocks.assignTeamToEntity.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/team-assignments"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ team_id: team.id, entity_type: "task", entity_id: task.body.task.id })
        .expect(400);
    });

    it("returns 400 when removeTeamFromEntity throws", async () => {
      const team = await createCollabTeam(fixture.owner, fixture.id);
      const task = await agent
        .post(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Assign Fail" })
        .expect(201);
      await agent
        .post(wsPath(fixture.id, "/team-assignments"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ team_id: team.id, entity_type: "task", entity_id: task.body.task.id })
        .expect(201);
      mocks.removeTeamFromEntity.mockImplementation(serviceError);
      await agent
        .delete(wsPath(fixture.id, "/team-assignments"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ team_id: team.id, entity_type: "task", entity_id: task.body.task.id })
        .expect(400);
    });

    it("returns 400 when listInvitations throws", async () => {
      mocks.listInvitations.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/invitations"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when resendInvitation throws", async () => {
      const devRole = actual.workspaceRoles.getRoleBySlug(fixture.id, "developer")!;
      const createRes = await agent
        .post(wsPath(fixture.id, "/invitations"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ email: "resend-fail@test.local", role_id: devRole.id })
        .expect(201);
      mocks.resendInvitation.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/invitations/${createRes.body.invitation.id}/resend`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when revokeInvitation throws", async () => {
      const devRole = actual.workspaceRoles.getRoleBySlug(fixture.id, "developer")!;
      const createRes = await agent
        .post(wsPath(fixture.id, "/invitations"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ email: "revoke-fail@test.local", role_id: devRole.id })
        .expect(201);
      mocks.revokeInvitation.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, `/invitations/${createRes.body.invitation.id}/revoke`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listAllApprovals throws", async () => {
      mocks.listAllApprovals.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/approvals"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when listMyApprovalRequests throws", async () => {
      mocks.listMyApprovalRequests.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/approvals/mine"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createApprovalRequest throws", async () => {
      mocks.createApprovalRequest.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/approvals"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ permission_code: "team.create", title: "Fail", description: "Fail" })
        .expect(400);
    });

    it("returns 400 when approveRequest throws", async () => {
      mocks.approveRequest.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/approvals/00000000-0000-4000-8000-000000000003/approve"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when rejectRequest throws", async () => {
      mocks.rejectRequest.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/approvals/00000000-0000-4000-8000-000000000004/reject"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ note: "Fail" })
        .expect(400);
    });

    it("returns 400 when createTaskInWorkspace throws", async () => {
      mocks.createTaskInWorkspace.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Fail Task" })
        .expect(400);
    });

    it("returns 400 when listIssuesInWorkspace throws", async () => {
      mocks.listIssuesInWorkspace.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/issues"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createIssueInWorkspace throws", async () => {
      mocks.createIssueInWorkspace.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/issues"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Fail Issue" })
        .expect(400);
    });

    it("returns 400 when listSubtasksInWorkspace throws", async () => {
      mocks.listSubtasksInWorkspace.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/subtasks"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when createSubtaskInWorkspace throws", async () => {
      const task = await agent
        .post(wsPath(fixture.id, "/tasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Parent" })
        .expect(201);
      mocks.createSubtaskInWorkspace.mockImplementation(serviceError);
      await agent
        .post(wsPath(fixture.id, "/subtasks"))
        .set(authHeader(fixture.owner.accessToken))
        .send({ title: "Fail Subtask", task_id: task.body.task.id })
        .expect(400);
    });

    it("returns 400 when permissions/me throws", async () => {
      mocks.isApprovalFlowsEnabled.mockImplementation(serviceError);
      await agent
        .get(wsPath(fixture.id, "/permissions/me"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 404 when getTeam returns undefined", async () => {
      mocks.getTeam.mockReturnValue(undefined);
      await agent
        .get(wsPath(fixture.id, "/teams/00000000-0000-4000-8000-000000000010"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 404 when getMemberManagementSummary returns undefined", async () => {
      mocks.getMemberManagementSummary.mockReturnValue(undefined);
      const memberId = await getOwnerMemberId(fixture.owner, fixture.id);
      await agent
        .get(wsPath(fixture.id, `/members/${memberId}/summary`))
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 404 when getProject returns undefined", async () => {
      mocks.getProject.mockReturnValue(undefined);
      await agent
        .get(wsPath(fixture.id, "/projects/00000000-0000-4000-8000-000000000011"))
        .set(authHeader(fixture.owner.accessToken))
        .expect(404);
    });

    it("returns 400 when addProjectMember lacks member_id", async () => {
      const project = await createCollabProject(fixture.owner, fixture.id);
      await agent
        .post(wsPath(fixture.id, `/projects/${project.id}/members`))
        .set(authHeader(fixture.owner.accessToken))
        .send({})
        .expect(400);
    });

    it("returns 400 when delete team-assignment lacks params", async () => {
      await agent
        .delete(wsPath(fixture.id, "/team-assignments"))
        .set(authHeader(fixture.owner.accessToken))
        .send({})
        .expect(400);
    });
  });

  describe("invitation routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("inv"));
    });

    it("returns 400 when getInvitationPreview throws", async () => {
      mocks.getInvitationPreview.mockImplementation(serviceError);
      await agent.get("/api/invitations/preview/fake-token").expect(400);
    });

    it("returns 400 when listMyPendingInvitations throws", async () => {
      mocks.listMyPendingInvitations.mockImplementation(serviceError);
      await agent
        .get("/api/invitations/mine")
        .set(authHeader(fixture.owner.accessToken))
        .expect(400);
    });

    it("returns 400 when acceptInvitation throws", async () => {
      mocks.acceptInvitation.mockImplementation(serviceError);
      await agent
        .post("/api/invitations/accept")
        .set(authHeader(fixture.owner.accessToken))
        .send({ token: "fake-token" })
        .expect(400);
    });

    it("returns 400 when rejectInvitation throws", async () => {
      mocks.rejectInvitation.mockImplementation(serviceError);
      await agent
        .post("/api/invitations/reject")
        .set(authHeader(fixture.owner.accessToken))
        .send({ token: "fake-token" })
        .expect(400);
    });

    it("returns 400 when accept lacks token", async () => {
      await agent
        .post("/api/invitations/accept")
        .set(authHeader(fixture.owner.accessToken))
        .send({})
        .expect(400);
    });

    it("returns 400 when reject lacks token", async () => {
      await agent
        .post("/api/invitations/reject")
        .set(authHeader(fixture.owner.accessToken))
        .send({})
        .expect(400);
    });
  });

  describe("users routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("users"));
    });

    it("returns 404 when getUser returns undefined on /me", async () => {
      mocks.getUser.mockReturnValue(undefined);
      await agent.get("/api/users/me").set(authHeader(fixture.owner.accessToken)).expect(404);
    });

    it("returns 400 when uploadUserAvatar throws", async () => {
      mocks.uploadUserAvatar.mockImplementation(serviceError);
      await agent
        .post("/api/users/me/avatar")
        .set(authHeader(fixture.owner.accessToken))
        .attach("file", Buffer.from("avatar"), { filename: "a.png", contentType: "image/png" })
        .expect(400);
    });

    it("returns 400 when getUserAvatarPath throws", async () => {
      mocks.getUserAvatarPath.mockImplementation(serviceError);
      await agent.get(`/api/users/${fixture.owner.id}/avatar`).expect(400);
    });
  });

  describe("auth routes", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
      fixture = createWorkspaceFixture(uniqueFixturePrefix("auth"));
    });

    it("returns 400 when listActiveSessions throws", async () => {
      mocks.listActiveSessions.mockImplementation(serviceError);
      await agent.get("/api/auth/sessions").set(authHeader(fixture.owner.accessToken)).expect(400);
    });
  });
});
