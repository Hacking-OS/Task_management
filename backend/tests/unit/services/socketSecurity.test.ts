import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { Socket } from "socket.io";
import {
  initSocketAuthData,
  validateSocketSession,
  authorizeWorkspaceSubscribe,
  authorizeTeamSubscribe,
  trackWorkspaceSubscribe,
  trackWorkspaceUnsubscribe,
  trackTeamSubscribe,
  trackTeamUnsubscribe,
  leaveAllAuthorizedRooms,
  leaveWorkspaceRoom,
  revalidateSocketSubscriptions,
  cleanupSocketRateLimit,
} from "../../../src/services/socketSecurity.js";
import { createAuthenticatedSession, revokeSession } from "../../../src/services/sessions.js";
import { db } from "../../../src/db.js";
import { addWorkspaceMember, createTestUser, createWorkspaceFixture } from "../../setup/fixtures.js";
import * as teamService from "../../../src/services/teams.js";

function createMockSocket(socketId = "socket-test-1"): Socket & {
  emit: jest.Mock;
  disconnect: jest.Mock;
} {
  return {
    id: socketId,
    data: {},
    handshake: {
      headers: { "user-agent": "jest-socket-agent" },
      address: "127.0.0.1",
    },
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket & { emit: jest.Mock; disconnect: jest.Mock };
}

describe("socketSecurity service", () => {
  beforeEach(() => {
    cleanupSocketRateLimit("socket-test-1");
    cleanupSocketRateLimit("socket-rate");
  });

  describe("initSocketAuthData", () => {
    it("initializes user id, session id, and subscription sets", () => {
      const socket = createMockSocket();
      initSocketAuthData(socket, "user-1", "session-1");

      expect(socket.data.userId).toBe("user-1");
      expect(socket.data.sessionId).toBe("session-1");
      expect(socket.data.subscribedWorkspaces).toBeInstanceOf(Set);
      expect(socket.data.subscribedTeams).toBeInstanceOf(Set);
    });

    it("omits session id when not provided", () => {
      const socket = createMockSocket();
      initSocketAuthData(socket, "user-2");
      expect(socket.data.sessionId).toBeUndefined();
    });
  });

  describe("validateSocketSession", () => {
    it("returns true when no session id is bound", () => {
      const socket = createMockSocket();
      initSocketAuthData(socket, createTestUser("sock_no_sess").id);
      expect(validateSocketSession(socket)).toBe(true);
    });

    it("returns true for an active session", () => {
      const user = createTestUser("sock_active");
      const { session } = createAuthenticatedSession(user.id);
      const socket = createMockSocket();
      initSocketAuthData(socket, user.id, session.id);
      expect(validateSocketSession(socket)).toBe(true);
    });

    it("disconnects and emits when session is revoked", () => {
      const user = createTestUser("sock_revoked");
      const { session } = createAuthenticatedSession(user.id);
      const socket = createMockSocket();
      initSocketAuthData(socket, user.id, session.id);
      revokeSession(session.id, user.id);

      expect(validateSocketSession(socket)).toBe(false);
      expect(socket.emit).toHaveBeenCalledWith("security.session_revoked", {
        reason: "Session expired or revoked",
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe("authorizeWorkspaceSubscribe", () => {
    it("allows workspace members and returns security version", () => {
      const { id, owner } = createWorkspaceFixture("sock_ws_ok");
      const socket = createMockSocket();
      initSocketAuthData(socket, owner.id);

      const result = authorizeWorkspaceSubscribe(socket, id);
      expect(result.ok).toBe(true);
      expect(typeof result.securityVersion).toBe("number");
    });

    it("rejects invalid workspace id", () => {
      const user = createTestUser("sock_ws_bad");
      const socket = createMockSocket();
      initSocketAuthData(socket, user.id);

      expect(authorizeWorkspaceSubscribe(socket, "").ok).toBe(false);
      expect(authorizeWorkspaceSubscribe(socket, 123).reason).toBe("Invalid workspace id");
    });

    it("rejects non-members", () => {
      const { id } = createWorkspaceFixture("sock_ws_deny");
      const outsider = createTestUser("sock_outsider");
      const socket = createMockSocket();
      initSocketAuthData(socket, outsider.id);

      const result = authorizeWorkspaceSubscribe(socket, id);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("Workspace access denied");
    });

    it("rejects when session is invalid", () => {
      const { id, owner } = createWorkspaceFixture("sock_ws_sess");
      const { session } = createAuthenticatedSession(owner.id);
      const socket = createMockSocket();
      initSocketAuthData(socket, owner.id, session.id);
      revokeSession(session.id, owner.id);

      const result = authorizeWorkspaceSubscribe(socket, id);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("Session invalid");
    });

    it("enforces subscribe rate limit", () => {
      const { id, owner } = createWorkspaceFixture("sock_ws_rate");
      const socket = createMockSocket("socket-rate");
      initSocketAuthData(socket, owner.id);

      for (let i = 0; i < 30; i += 1) {
        expect(authorizeWorkspaceSubscribe(socket, id).ok).toBe(true);
      }
      const limited = authorizeWorkspaceSubscribe(socket, id);
      expect(limited.ok).toBe(false);
      expect(limited.reason).toBe("Rate limit exceeded");
    });
  });

  describe("authorizeTeamSubscribe", () => {
    it("allows workspace owner without team membership", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_owner");
      const team = teamService.createTeam(owner.id, id, { name: "Owner Team" });
      const socket = createMockSocket();
      initSocketAuthData(socket, owner.id);

      const result = authorizeTeamSubscribe(socket, team.id);
      expect(result.ok).toBe(true);
    });

    it("allows team lead", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_lead");
      const member = addWorkspaceMember(id, "developer");
      const members = db.prepare("SELECT id FROM workspace_members WHERE user_id = ?").all(member.id) as { id: string }[];
      const team = teamService.createTeam(owner.id, id, { name: "Lead Team", lead_member_id: members[0].id });
      const socket = createMockSocket();
      initSocketAuthData(socket, member.id);

      const result = authorizeTeamSubscribe(socket, team.id);
      expect(result.ok).toBe(true);
    });

    it("allows regular team member", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_member");
      const member = addWorkspaceMember(id, "developer");
      const ownerMember = db.prepare(`
        SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
      `).get(id, owner.id) as { id: string };
      const memberRow = db.prepare(`
        SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
      `).get(id, member.id) as { id: string };
      const team = teamService.createTeam(owner.id, id, { name: "Member Team", lead_member_id: ownerMember.id });
      teamService.addTeamMember(owner.id, id, team.id, memberRow.id);

      const socket = createMockSocket();
      initSocketAuthData(socket, member.id);
      const result = authorizeTeamSubscribe(socket, team.id);
      expect(result.ok).toBe(true);
    });

    it("rejects unknown team", () => {
      const user = createTestUser("sock_team_missing");
      const socket = createMockSocket();
      initSocketAuthData(socket, user.id);

      const result = authorizeTeamSubscribe(socket, "00000000-0000-0000-0000-000000000099");
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("Team not found");
    });

    it("rejects workspace member who is not on the team", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_out");
      const member = addWorkspaceMember(id, "viewer");
      const team = teamService.createTeam(owner.id, id, { name: "Closed Team" });
      const socket = createMockSocket();
      initSocketAuthData(socket, member.id);

      const result = authorizeTeamSubscribe(socket, team.id);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("Team access denied");
    });

    it("rejects invalid team id", () => {
      const user = createTestUser("sock_team_bad");
      const socket = createMockSocket();
      initSocketAuthData(socket, user.id);
      expect(authorizeTeamSubscribe(socket, "").reason).toBe("Invalid team id");
    });
  });

  describe("subscription tracking and room cleanup", () => {
    it("tracks workspace and team subscriptions", () => {
      const socket = createMockSocket();
      initSocketAuthData(socket, "user-track");

      trackWorkspaceSubscribe(socket, "ws-1");
      trackTeamSubscribe(socket, "team-1");
      expect((socket.data.subscribedWorkspaces as Set<string>).has("ws-1")).toBe(true);
      expect((socket.data.subscribedTeams as Set<string>).has("team-1")).toBe(true);

      trackWorkspaceUnsubscribe(socket, "ws-1");
      trackTeamUnsubscribe(socket, "team-1");
      expect((socket.data.subscribedWorkspaces as Set<string>).size).toBe(0);
      expect((socket.data.subscribedTeams as Set<string>).size).toBe(0);
    });

    it("leaveAllAuthorizedRooms clears tracked rooms", () => {
      const socket = createMockSocket();
      initSocketAuthData(socket, "user-leave");
      trackWorkspaceSubscribe(socket, "ws-a");
      trackTeamSubscribe(socket, "team-a");

      const left: string[] = [];
      leaveAllAuthorizedRooms(socket, (room) => left.push(room), {
        workspace: (id) => `workspace:${id}`,
        team: (id) => `team:${id}`,
      });

      expect(left).toEqual(["workspace:ws-a", "team:team-a"]);
      expect((socket.data.subscribedWorkspaces as Set<string>).size).toBe(0);
      expect((socket.data.subscribedTeams as Set<string>).size).toBe(0);
    });

    it("leaveWorkspaceRoom leaves room and untracks workspace", () => {
      const socket = createMockSocket();
      initSocketAuthData(socket, "user-ws-room");
      trackWorkspaceSubscribe(socket, "ws-room");

      const left: string[] = [];
      leaveWorkspaceRoom(socket, "ws-room", (room) => left.push(room), "workspace:ws-room");
      expect(left).toEqual(["workspace:ws-room"]);
      expect((socket.data.subscribedWorkspaces as Set<string>).size).toBe(0);
    });

    it("revalidateSocketSubscriptions removes revoked workspace access", () => {
      const { id, owner } = createWorkspaceFixture("sock_reval");
      const member = addWorkspaceMember(id, "developer");
      const socket = createMockSocket();
      initSocketAuthData(socket, member.id);
      trackWorkspaceSubscribe(socket, id);

      db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?").run(id, member.id);

      const left: string[] = [];
      revalidateSocketSubscriptions(socket, (room) => left.push(room), {
        workspace: (wsId) => `workspace:${wsId}`,
        team: (teamId) => `team:${teamId}`,
      });

      expect(left).toEqual([`workspace:${id}`]);
      expect(socket.emit).toHaveBeenCalledWith(
        "security.changed",
        expect.objectContaining({ workspaceId: id, event: "workspace.access.revoked" }),
      );
    });

    it("revalidateSocketSubscriptions removes invalid team subscriptions", () => {
      const { id, owner } = createWorkspaceFixture("sock_reval_team");
      const team = teamService.createTeam(owner.id, id, { name: "Reval Team" });
      const socket = createMockSocket();
      initSocketAuthData(socket, owner.id);
      trackTeamSubscribe(socket, team.id);

      db.prepare("DELETE FROM workspace_teams WHERE id = ?").run(team.id);

      const left: string[] = [];
      revalidateSocketSubscriptions(socket, (room) => left.push(room), {
        workspace: (wsId) => `workspace:${wsId}`,
        team: (teamId) => `team:${teamId}`,
      });

      expect(left).toEqual([`team:${team.id}`]);
    });

    it("revalidateSocketSubscriptions removes team when member loses team access", () => {
      const { id, owner } = createWorkspaceFixture("sock_reval_team_denied");
      const member = addWorkspaceMember(id, "viewer");
      const team = teamService.createTeam(owner.id, id, { name: "Members Only" });
      const socket = createMockSocket();
      initSocketAuthData(socket, member.id);
      trackTeamSubscribe(socket, team.id);

      const left: string[] = [];
      revalidateSocketSubscriptions(socket, (room) => left.push(room), {
        workspace: (wsId) => `workspace:${wsId}`,
        team: (teamId) => `team:${teamId}`,
      });

      expect(left).toEqual([`team:${team.id}`]);
      expect((socket.data.subscribedTeams as Set<string>).size).toBe(0);
    });

    it("revalidateSocketSubscriptions exits early when session is revoked", () => {
      const { id, owner } = createWorkspaceFixture("sock_reval_revoked");
      const { session } = createAuthenticatedSession(owner.id);
      const socket = createMockSocket();
      initSocketAuthData(socket, owner.id, session.id);
      trackWorkspaceSubscribe(socket, id);
      trackTeamSubscribe(socket, "team-stale");
      revokeSession(session.id, owner.id);

      const left: string[] = [];
      revalidateSocketSubscriptions(socket, (room) => left.push(room), {
        workspace: (wsId) => `workspace:${wsId}`,
        team: (teamId) => `team:${teamId}`,
      });

      expect(left).toEqual([]);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.emit).toHaveBeenCalledWith("security.session_revoked", {
        reason: "Session expired or revoked",
      });
    });
  });

  describe("authorizeTeamSubscribe extended", () => {
    it("rejects when session is invalid", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_sess");
      const { session } = createAuthenticatedSession(owner.id);
      const team = teamService.createTeam(owner.id, id, { name: "Session Team" });
      const socket = createMockSocket();
      initSocketAuthData(socket, owner.id, session.id);
      revokeSession(session.id, owner.id);

      const result = authorizeTeamSubscribe(socket, team.id);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("Session invalid");
    });

    it("enforces team subscribe rate limit", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_rate");
      const team = teamService.createTeam(owner.id, id, { name: "Rate Team" });
      const socket = createMockSocket("socket-team-rate");
      initSocketAuthData(socket, owner.id);

      for (let i = 0; i < 30; i += 1) {
        expect(authorizeTeamSubscribe(socket, team.id).ok).toBe(true);
      }
      const limited = authorizeTeamSubscribe(socket, team.id);
      expect(limited.ok).toBe(false);
      expect(limited.reason).toBe("Rate limit exceeded");
    });

    it("rejects workspace outsider for existing team", () => {
      const { id, owner } = createWorkspaceFixture("sock_team_outsider");
      const team = teamService.createTeam(owner.id, id, { name: "Outsider Team" });
      const outsider = createTestUser("sock_team_outsider_user");
      const socket = createMockSocket();
      initSocketAuthData(socket, outsider.id);

      const result = authorizeTeamSubscribe(socket, team.id);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("Workspace access denied");
    });
  });

  describe("subscription set initialization", () => {
    it("initializes workspace and team subscription sets when missing", () => {
      const { id, owner } = createWorkspaceFixture("sock_sets");
      const team = teamService.createTeam(owner.id, id, { name: "Set Team" });
      const socket = createMockSocket("socket-sets") as Socket & {
        emit: jest.Mock;
        disconnect: jest.Mock;
        data: Record<string, unknown>;
      };
      socket.data = { userId: owner.id };

      expect(authorizeWorkspaceSubscribe(socket, id).ok).toBe(true);
      expect(authorizeTeamSubscribe(socket, team.id).ok).toBe(true);
      expect(socket.data.subscribedWorkspaces).toBeUndefined();
      expect(socket.data.subscribedTeams).toBeUndefined();

      trackWorkspaceSubscribe(socket, id);
      trackTeamSubscribe(socket, team.id);
      expect((socket.data.subscribedWorkspaces as Set<string>).has(id)).toBe(true);
      expect((socket.data.subscribedTeams as Set<string>).has(team.id)).toBe(true);
    });
  });

  describe("cleanupSocketRateLimit", () => {
    it("resets rate limit bucket for a socket id", () => {
      const { id, owner } = createWorkspaceFixture("sock_cleanup");
      const socket = createMockSocket("socket-cleanup");
      initSocketAuthData(socket, owner.id);

      for (let i = 0; i < 30; i += 1) {
        authorizeWorkspaceSubscribe(socket, id);
      }
      cleanupSocketRateLimit("socket-cleanup");
      expect(authorizeWorkspaceSubscribe(socket, id).ok).toBe(true);
    });
  });
});
