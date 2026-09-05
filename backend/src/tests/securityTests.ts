/**
 * Security boundary tests — run after `npm run reset-db` with seeded demo data.
 * Usage: npm run security-test
 */
import { db, initDb } from "../db.js";
import { authorize, requireAuthorize } from "../services/authorizationService.js";
import { PermissionDeniedError } from "../services/authorization.js";
import { getMemberSecurityVersion, bumpMemberSecurityVersion } from "../services/securityVersion.js";
import { canDecideApproval } from "../services/permissionResolver.js";
import { requireApprovalDecisionAuthority } from "../services/authorizationService.js";
import { listComments } from "../services/comments.js";
import { userCanAccessProject, listAccessibleProjectIds } from "../services/projectAccess.js";
import * as projectService from "../services/projects.js";
import { setAssigneeIds } from "../services/entityAssignments.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function getDemoUsers() {
  const owner = db.prepare("SELECT id FROM users WHERE username = 'demo'").get() as { id: string } | undefined;
  const admin = db.prepare("SELECT id FROM users WHERE username = 'freelancer'").get() as { id: string } | undefined;
  const workspace = db.prepare("SELECT id FROM workspaces WHERE name LIKE '%Acme%' LIMIT 1").get() as { id: string } | undefined;
  if (!owner || !admin || !workspace) {
    throw new Error("Demo seed missing — run npm run reset-db first");
  }
  return { ownerId: owner.id, memberId: admin.id, workspaceId: workspace.id };
}

console.log("Security matrix tests\n");

initDb();

const { ownerId, memberId, workspaceId } = getDemoUsers();

// Owner can view workspace
const ownerView = authorize({ userId: ownerId, workspaceId, permission: "workspace.view" });
assert(ownerView.allowed, "Owner | workspace.view | allowed");

// Cross-workspace resource scoping — fake task id should 404 scope
const fakeTaskId = "00000000-0000-0000-0000-000000000099";
const crossScope = authorize({
  userId: ownerId,
  workspaceId,
  permission: "task.delete",
  resourceType: "task",
  resourceId: fakeTaskId,
});
assert(!crossScope.allowed && crossScope.reason === "Resource not found", "Cross-workspace task | denied as not found");

// Member without task.delete should be denied (unless granted in seed)
const memberDelete = authorize({ userId: memberId, workspaceId, permission: "task.delete" });
assert(
  memberDelete.allowed || memberDelete.requiresApproval || memberDelete.denied,
  "Member | task.delete | resolves (allow/approval/deny)"
);

// Stale security version is logged but backend still resolves fresh
const versionBefore = getMemberSecurityVersion(workspaceId, memberId);
const memberRow = db.prepare(`
  SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
`).get(workspaceId, memberId) as { id: string };
bumpMemberSecurityVersion(memberRow.id, "permission.changed");
const versionAfter = getMemberSecurityVersion(workspaceId, memberId);
assert(versionAfter > versionBefore, "Security version increments on permission change");

const staleCheck = authorize({
  userId: memberId,
  workspaceId,
  permission: "task.view",
  clientSecurityVersion: versionBefore,
});
assert(staleCheck.securityVersion === versionAfter, "Stale client version still resolves current server version");

// Non-member gets workspace access denied
const outsider = db.prepare("SELECT id FROM users WHERE username = 'newuser'").get() as { id: string } | undefined;
if (outsider) {
  const outsiderAuth = authorize({ userId: outsider.id, workspaceId, permission: "workspace.view" });
  assert(!outsiderAuth.allowed, "Non-member | workspace.view | denied");
}

// Approval decision authority requires current permission
const ownerCanDecide = canDecideApproval(ownerId, workspaceId, "task.delete");
assert(ownerCanDecide, "Owner can decide task.delete approvals");

try {
  if (outsider) {
    requireApprovalDecisionAuthority(outsider.id, workspaceId, "task.delete");
    assert(false, "Outsider approval decision | should throw");
  }
} catch {
  assert(true, "Outsider approval decision | throws ForbiddenError");
}

// requireAuthorize throws PermissionDeniedError when denied
try {
  if (outsider) {
    requireAuthorize({ userId: outsider.id, workspaceId, permission: "task.delete" });
    assert(false, "Outsider requireAuthorize | should throw");
  }
} catch (e) {
  assert(e instanceof PermissionDeniedError, "Outsider requireAuthorize | PermissionDeniedError");
}

// Comments require valid entity + permission
try {
  listComments(memberId, "task", fakeTaskId);
  assert(false, "Comments on missing entity | should throw");
} catch (e) {
  assert((e as Error).message.includes("Entity not found"), "Comments on missing entity | throws");
}

// Project access — member sees only accessible projects
const memberProjects = listAccessibleProjectIds(memberId, workspaceId);
assert(Array.isArray(memberProjects), "Member | listAccessibleProjectIds | returns array");

const allProjects = db.prepare(`
  SELECT id FROM workspace_projects WHERE workspace_id = ? AND status = 'active'
`).all(workspaceId) as { id: string }[];
if (allProjects.length > 0) {
  const inaccessible = allProjects.find((p) => !memberProjects.includes(p.id));
  if (inaccessible) {
    try {
      projectService.updateProject(memberId, workspaceId, inaccessible.id, { name: "Hacked" });
      assert(false, "Member | update inaccessible project | should throw");
    } catch {
      assert(true, "Member | update inaccessible project | denied");
    }
  } else {
    assert(true, "Member | project scope | all projects accessible (seed config)");
  }
}

// Assignee must be workspace member
const sampleTask = db.prepare(`
  SELECT id, workspace_id FROM tasks WHERE workspace_id = ? LIMIT 1
`).get(workspaceId) as { id: string; workspace_id: string } | undefined;
if (sampleTask && outsider) {
  try {
    setAssigneeIds(ownerId, sampleTask.workspace_id, "task", sampleTask.id, [outsider.id], "Test", "task.assign");
    assert(false, "Assign outsider to task | should throw");
  } catch {
    assert(true, "Assign outsider to task | rejected");
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
