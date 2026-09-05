import { createProject } from "../../src/services/projects.js";
import { userCanAccessProject } from "../../src/services/projectAccess.js";
import { createTeam, addTeamMember, removeTeamMember } from "../../src/services/teams.js";
import { getMembership } from "../../src/services/authorization.js";
import { db } from "../../src/db.js";
import { addWorkspaceMember, createWorkspaceFixture } from "../setup/fixtures.js";

describe("workspace isolation", () => {
  it("user in workspace A cannot access workspace B project", () => {
    const wsA = createWorkspaceFixture("iso_a");
    const wsB = createWorkspaceFixture("iso_b");
    const memberA = addWorkspaceMember(wsA.id, "developer");

    const projectB = createProject(wsB.owner.id, wsB.id, { name: "Secret Project", description: "Hidden" });

    expect(userCanAccessProject(memberA.id, wsB.id, projectB.id)).toBe(false);
  });

  it("owner can access own workspace project", () => {
    const { id, owner } = createWorkspaceFixture("iso_own");
    const project = createProject(owner.id, id, { name: "Visible", description: "" });
    expect(userCanAccessProject(owner.id, id, project.id)).toBe(true);
  });
});

describe("multi-team membership", () => {
  it("removing one team does not remove others", () => {
    const { id, owner } = createWorkspaceFixture("multi_team");
    const user = addWorkspaceMember(id, "developer");
    const membership = getMembership(user.id, id)!;

    const backend = createTeam(owner.id, id, { name: "Backend" });
    const devops = createTeam(owner.id, id, { name: "DevOps" });
    const qa = createTeam(owner.id, id, { name: "QA" });

    addTeamMember(owner.id, id, backend.id, membership.id);
    addTeamMember(owner.id, id, devops.id, membership.id);
    addTeamMember(owner.id, id, qa.id, membership.id);

    removeTeamMember(owner.id, id, backend.id, membership.id);

    const teams = db
      .prepare(
        `SELECT t.name FROM team_members tm
         JOIN workspace_teams t ON t.id = tm.team_id
         JOIN workspace_members m ON m.id = tm.member_id
         WHERE m.user_id = ? AND t.workspace_id = ?`,
      )
      .all(user.id, id) as { name: string }[];

    const names = teams.map((t) => t.name).sort();
    expect(names).toEqual(["DevOps", "QA"]);
  });
});
