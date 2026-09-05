import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { ForbiddenError, requireMembership, isWorkspaceOwner } from "./authorization.js";
import { isTeamLead } from "./teams.js";
import { notify } from "./notifications.js";

export type TeamJoinStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface TeamMembershipRequest {
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
}

export interface TeamJoinRequestDetails extends TeamMembershipRequest {
  requester_username: string;
  requester_email: string;
  team_name: string;
}

function getMemberIdForUser(workspaceId: string, userId: string): string | undefined {
  const row = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { id: string } | undefined;
  return row?.id;
}

export function requestTeamMembership(
  userId: string,
  workspaceId: string,
  teamId: string,
  reason = ""
): TeamMembershipRequest {
  requireMembership(userId, workspaceId);

  const team = db.prepare(`
    SELECT id, name FROM workspace_teams WHERE id = ? AND workspace_id = ?
  `).get(teamId, workspaceId) as { id: string; name: string } | undefined;
  if (!team) throw new Error("Team not found");

  const memberId = getMemberIdForUser(workspaceId, userId);
  if (!memberId) throw new Error("Member not found");

  const existingMember = db.prepare(`
    SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?
  `).get(teamId, memberId);
  if (existingMember) throw new Error("You are already a member of this team");

  const pending = db.prepare(`
    SELECT id FROM team_membership_requests
    WHERE team_id = ? AND requester_member_id = ? AND status = 'pending'
  `).get(teamId, memberId);
  if (pending) throw new Error("Your request is already pending");

  const lastAttempt = db.prepare(`
    SELECT id, attempt_number FROM team_membership_requests
    WHERE team_id = ? AND requester_member_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(teamId, memberId) as { id: string; attempt_number: number } | undefined;

  const id = crypto.randomUUID();
  const attemptNumber = (lastAttempt?.attempt_number ?? 0) + 1;

  db.prepare(`
    INSERT INTO team_membership_requests (
      id, workspace_id, team_id, requester_member_id, reason, status,
      attempt_number, previous_request_id
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, workspaceId, teamId, memberId, reason.trim(), attemptNumber, lastAttempt?.id ?? null);

  const lead = db.prepare(`
    SELECT m.user_id FROM workspace_teams t
    JOIN workspace_members m ON m.id = t.lead_member_id
    WHERE t.id = ?
  `).get(teamId) as { user_id: string } | undefined;

  if (lead) {
    notify({
      userId: lead.user_id,
      type: "info",
      title: "Team join request",
      message: `Someone requested to join ${team.name}.`,
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      metadata: { action: "team_join_requested", team_id: teamId, request_id: id },
    });
  }

  ActivityLogger.log({
    userId,
    workspaceId,
    entityType: "workspace",
    entityId: teamId,
    action: "team_join_requested",
    description: `Requested to join team ${team.name}`,
    metadata: { team_id: teamId, request_id: id, attempt_number: attemptNumber },
  });

  return db.prepare("SELECT * FROM team_membership_requests WHERE id = ?").get(id) as TeamMembershipRequest;
}

function enrichRequest(row: TeamMembershipRequest): TeamJoinRequestDetails {
  const requester = db.prepare(`
    SELECT u.username, u.email FROM workspace_members m
    JOIN users u ON u.id = m.user_id WHERE m.id = ?
  `).get(row.requester_member_id) as { username: string; email: string };

  const team = db.prepare("SELECT name FROM workspace_teams WHERE id = ?").get(row.team_id) as { name: string };

  return {
    ...row,
    requester_username: requester.username,
    requester_email: requester.email,
    team_name: team.name,
  };
}

export function listTeamJoinRequestsForLead(
  userId: string,
  workspaceId: string,
  teamId: string,
  status?: TeamJoinStatus
): TeamJoinRequestDetails[] {
  if (!isWorkspaceOwner(userId, workspaceId) && !isTeamLead(userId, teamId)) {
    throw new ForbiddenError("Only the team lead or workspace owner can review join requests");
  }

  let sql = `
    SELECT * FROM team_membership_requests
    WHERE workspace_id = ? AND team_id = ?
  `;
  const params: unknown[] = [workspaceId, teamId];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC";
  return (db.prepare(sql).all(...params) as TeamMembershipRequest[]).map(enrichRequest);
}

export function listMyTeamJoinRequests(userId: string, workspaceId: string): TeamJoinRequestDetails[] {
  const memberId = getMemberIdForUser(workspaceId, userId);
  if (!memberId) return [];
  const rows = db.prepare(`
    SELECT * FROM team_membership_requests
    WHERE workspace_id = ? AND requester_member_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId, memberId) as TeamMembershipRequest[];
  return rows.map(enrichRequest);
}

export function getMyTeamJoinStatus(
  userId: string,
  workspaceId: string,
  teamId: string
): { is_member: boolean; pending: boolean; last_rejected: boolean } {
  const memberId = getMemberIdForUser(workspaceId, userId);
  if (!memberId) return { is_member: false, pending: false, last_rejected: false };

  const isMember = !!db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?").get(teamId, memberId);
  const pending = !!db.prepare(`
    SELECT 1 FROM team_membership_requests
    WHERE team_id = ? AND requester_member_id = ? AND status = 'pending'
  `).get(teamId, memberId);

  const last = db.prepare(`
    SELECT status FROM team_membership_requests
    WHERE team_id = ? AND requester_member_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(teamId, memberId) as { status: string } | undefined;

  return { is_member: isMember, pending, last_rejected: last?.status === "rejected" && !isMember && !pending };
}

export function approveTeamJoinRequest(userId: string, requestId: string): TeamJoinRequestDetails {
  const request = db.prepare("SELECT * FROM team_membership_requests WHERE id = ?").get(requestId) as
    | TeamMembershipRequest
    | undefined;
  if (!request) throw new Error("Request not found");
  if (request.status !== "pending") throw new Error("Request is no longer pending");

  if (!isWorkspaceOwner(userId, request.workspace_id) && !isTeamLead(userId, request.team_id)) {
    throw new ForbiddenError("Only the team lead or workspace owner can approve join requests");
  }

  const stillMember = db.prepare(`
    SELECT 1 FROM workspace_members WHERE id = ? AND workspace_id = ?
  `).get(request.requester_member_id, request.workspace_id);
  if (!stillMember) throw new Error("Requester is no longer a workspace member");

  const tx = db.transaction(() => {
    const current = db.prepare(`
      SELECT status FROM team_membership_requests WHERE id = ?
    `).get(requestId) as { status: string } | undefined;
    if (!current || current.status !== "pending") {
      throw new Error("Request is no longer pending");
    }

    db.prepare(`
      INSERT OR IGNORE INTO team_members (team_id, member_id) VALUES (?, ?)
    `).run(request.team_id, request.requester_member_id);

    db.prepare(`
      UPDATE team_membership_requests
      SET status = 'approved', decided_by = ?, decided_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(userId, requestId);
  });
  tx();

  const requesterUser = db.prepare(`
    SELECT user_id FROM workspace_members WHERE id = ?
  `).get(request.requester_member_id) as { user_id: string };

  notify({
    userId: requesterUser.user_id,
    type: "success",
    title: "Team join approved",
    message: "Your team membership request was approved.",
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.workspace_id,
    metadata: { action: "team_join_approved", team_id: request.team_id, request_id: requestId },
  });

  ActivityLogger.log({
    userId,
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.team_id,
    action: "team_join_approved",
    description: "Approved team membership request",
    metadata: { request_id: requestId, member_id: request.requester_member_id },
  });

  return enrichRequest(
    db.prepare("SELECT * FROM team_membership_requests WHERE id = ?").get(requestId) as TeamMembershipRequest
  );
}

export function rejectTeamJoinRequest(userId: string, requestId: string, rejectionReason = ""): TeamJoinRequestDetails {
  const request = db.prepare("SELECT * FROM team_membership_requests WHERE id = ?").get(requestId) as
    | TeamMembershipRequest
    | undefined;
  if (!request) throw new Error("Request not found");
  if (request.status !== "pending") throw new Error("Request is no longer pending");

  if (!isWorkspaceOwner(userId, request.workspace_id) && !isTeamLead(userId, request.team_id)) {
    throw new ForbiddenError("Only the team lead or workspace owner can reject join requests");
  }

  const stillMember = db.prepare(`
    SELECT 1 FROM workspace_members WHERE id = ? AND workspace_id = ?
  `).get(request.requester_member_id, request.workspace_id);
  if (!stillMember) {
    db.prepare(`
      UPDATE team_membership_requests SET status = 'failed', rejection_reason = 'Requester no longer a member',
        decided_at = datetime('now'), updated_at = datetime('now'), decided_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(userId, requestId);
    throw new Error("Requester is no longer a workspace member");
  }

  const tx = db.transaction(() => {
    const current = db.prepare(`
      SELECT status FROM team_membership_requests WHERE id = ?
    `).get(requestId) as { status: string } | undefined;
    if (!current || current.status !== "pending") {
      throw new Error("Request is no longer pending");
    }

    const result = db.prepare(`
      UPDATE team_membership_requests
      SET status = 'rejected', decided_by = ?, rejection_reason = ?,
          decided_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(userId, rejectionReason.trim(), requestId);

    if (result.changes === 0) throw new Error("Request is no longer pending");
  });
  tx();

  const requesterUser = db.prepare(`
    SELECT user_id FROM workspace_members WHERE id = ?
  `).get(request.requester_member_id) as { user_id: string };

  notify({
    userId: requesterUser.user_id,
    type: "warning",
    title: "Team join rejected",
    message: rejectionReason.trim()
      ? `Your team join request was rejected: ${rejectionReason.trim()}`
      : "Your team join request was rejected.",
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.workspace_id,
    metadata: { action: "team_join_rejected", team_id: request.team_id, request_id: requestId },
  });

  ActivityLogger.log({
    userId,
    workspaceId: request.workspace_id,
    entityType: "workspace",
    entityId: request.team_id,
    action: "team_join_rejected",
    description: "Rejected team membership request",
    metadata: { request_id: requestId, member_id: request.requester_member_id },
  });

  return enrichRequest(
    db.prepare("SELECT * FROM team_membership_requests WHERE id = ?").get(requestId) as TeamMembershipRequest
  );
}
