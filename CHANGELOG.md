# Changelog

All notable changes to **Jellyfish Workspace (TMS)** are documented here.

Version numbers follow [Semantic Versioning](https://semver.org/).

For a full map of database entities, relationships, and structural changes, see **[ENTITIES.md](ENTITIES.md)**.

---

## [2.1.1] — 2026-09-05

Patch release: Jest coverage expansion, honest coverage thresholds, project detail loading fix, and timesheet billing review UI (billing module placeholder).

### Added

#### Testing & coverage
- Expanded backend Jest suites across **routes**, **services**, **middleware**, **validation**, and **permissions**
- New coverage suites including `servicesCoverageFinal`, route error paths, workspace collaboration invitations, and extended workspace API tests
- **`coverage-thresholds.cjs`** — thresholds generated from measured `coverage/coverage-summary.json` (not hand-edited)
- **`npm run coverage:sync-thresholds`** — regenerates committed floors after `test:coverage`
- Routes at **100%** line coverage; services at **~99.8%** lines (remaining gaps are rare edge/race paths)

#### Timesheets & billing
- **Day side panel** — clicking a calendar day with logged time opens a review drawer
- **Accept / reject for billing** — workspace owners and admins can accept or reject entries (or the whole day)
- Review state persisted client-side until billing APIs ship (`useTimesheetBillingReview`)
- **`BillingPage`** (`/billing`) — “In development” placeholder; nav link for owner/admin

### Fixed

- **Projects detail stuck on loading** — list and detail fetches no longer share one `useAsyncSession` generation; selecting a project no longer cancels the detail request
- Same session split applied on **Teams** page for list vs detail loads

### Changed

- Timesheet list table shown under the **All entries** tab; calendar days with data use the side panel
- Backend Jest README documents coverage sync workflow

### Documentation

- README and CHANGELOG updated for **2.1.1**

---

## [2.1.0] — 2026-09-05

Minor release: workspace **projects**, multi-team / multi-project membership, owner management UI, and frontend stability improvements.

### Added

#### Projects & membership
- **`workspace_projects`** — named projects within a workspace (active / archived, optional lead)
- **`project_members`** — direct project membership with roles (`lead`, `member`, `reviewer`)
- **`project_teams`** — many-to-many link between projects and teams
- **`projectAccess` service** — effective access = direct membership ∪ team-derived access
- **`projects` service** — CRUD, bulk team assignment, member management, summaries
- **`project.*` permissions** — view, create, update, delete, manage members, assign teams, change lead
- API routes under `/api/workspaces/:id/projects` plus member/team sub-resources
- **`GET /overview`** — workspace stats (teams, projects, members, pending approvals)
- **`GET /members/:memberId/summary`** — teams and projects for a member (owner management)
- **`tasks.project_id`**, **`issues.project_id`**, **`time_entries.project_id`** columns (schema ready for UI wiring)
- Demo seed: sample Acme projects + backfill for existing workspaces

#### Frontend — Projects & Teams
- **`ProjectsPage`** — master-detail layout with overview, members, and teams tabs
- **`TeamsPage`** refactor — professional resource layout; team detail shows assigned projects
- **`ResourceLayout`** — shared header, nav, tabs, and loading states
- **`MemberMembershipPanel`** — member teams/projects summary on permissions page
- **`WorkspaceDetailPage`** — overview stats and Projects navigation link
- **`EntityTypeBadge`** — color-coded Task / Issue / Subtask labels
- **Timesheet calendar** — month grid with daily totals and day filtering

#### Frontend — stability & performance
- **`useAsyncSession`** — generation tokens to cancel stale async updates
- **`App.tsx` / `AppRoutes.tsx`** split — providers stable across HMR (fixes `useAuth` context errors)
- **Shared Socket.IO** — single connection via `SocketProvider`; contexts subscribe to events
- **Request deduplication** — `requestCache.ts` reduces duplicate API calls
- Debounced project search; split initial vs list loading; stable selection on refresh

### Changed

- **Multi-team membership** — users belong to many teams via `team_members` (no `user.teamId`)
- **Multi-project membership** — users belong to many projects via `project_members` and/or assigned teams
- **`team_members.role_in_team`** — optional per-team role column added
- Teams and Projects pages use unified `.resource-*` CSS design system
- **`StatusContext`** — restored full implementation; workspace race guard on load

### Fixed

- **`EntityTypeBadge` export** — moved to `shared/entityType/` with barrel re-export
- **Projects/Teams effect loops** — removed unstable deps causing rapid mount/unmount
- **NotificationContext / TaskDetailPage** — duplicate fetch reduction (second-pass audit)
- **Project permission migration** — runs after system roles are seeded

### Fixed (QA pass)

- **Project mutation scope** — update/delete/members/teams require project access when user lacks `project.view_all`
- **Comments auth bypass** — listing comments on non-existent entities now denied
- **`comment.delete` permission** — delete comment checks correct permission (was `comment.create`)
- **Stats without workspace** — dashboard/severity exclude workspaces where user lacks `task.view`
- **Entity activity logs** — task/issue activity shows all entity logs (not only current user's)
- **Assignee validation** — cannot assign users outside the workspace
- **Team join approve race** — approve wrapped in transaction with pending-status guard
- **Approval rate limiting** — applied to submit/approve/reject routes
- **Team projects list** — filtered by user's project access
- **ProjectsPage stale team save** — clears team selection on project switch; blocks save while detail loading
- **Workspace switch stale state** — permissions/members/approvals/notifications refresh keyed by workspace ID
- **Auth token race** — stale `/users/me` responses ignored after logout/login
- **Subtasks double-submit** — submit button disabled while in flight

### Fixed (Advanced QA pass)

- **`isTeamLead` SQL bug** — missing `userId` parameter caused any team lead check to pass/fail incorrectly
- **Approval status migration** — relaxed DB CHECK to allow `executed`, `failed`, `cancelled` states
- **Stale approval on DENY** — approve revalidates requester permission; marks request `failed` when policy changed
- **Session-required tokens** — API and Socket.IO reject JWTs without server session id
- **Team join reject** — transactional with member-exists validation
- **`npm run complex-qa`** — automated multi-workspace / multi-path scenario suite (25+ cases)
- **`npm run auth-security-qa`** — focused auth, invitation, permission, approval, audit suite (51 cases)

### Fixed (Auth & security QA pass)

- **Separate signup/login rate limits** — IP-scoped limits with `Retry-After`, `RATE_LIMIT_TRIGGERED` security events
- **Invitation preview PII** — unauthenticated preview masks invitee email
- **Invalid invitation access** — wrong-user accept/reject logs `INVALID_INVITATION_ACCESS`
- **Duplicate workspace membership** — `addMember` guards existing membership; accept handles already-member gracefully
- **Invitation reject audit** — rejection writes activity log entry
- **Duplicate signup logging** — `REGISTER_FAILED` security event on duplicate credentials
- **Invite / team-join rate limits** — separate business API throttling
- **Frontend 429 handling** — `ApiError.retryAfter` from `Retry-After` header (no retry loop)

### Added (Refresh token architecture)

- **HttpOnly refresh cookie** — raw refresh token never returned in JSON; stored as hash server-side only
- **Short-lived access tokens** — 15-minute JWT (`accessToken` + `expiresIn` in API responses)
- **`POST /auth/refresh`** — reads cookie only; rotates refresh token; returns new access token
- **Refresh token rotation + reuse detection** — stale token reuse revokes token family
- **Cookie-only session bootstrap** — React restores auth via `/auth/refresh` on app load (no localStorage token)
- **Single-flight refresh** — concurrent 401s trigger one refresh; failed requests retry once
- **`credentials: include`** — all API calls send cookies; CORS configured with explicit origins
- **CSRF mitigation** — Origin validation on cookie-authenticated auth endpoints
- **`npm run refresh-auth-qa`** — rotation, reuse, revocation tests (10 cases)
- **`npm run role-permission-refresh-qa`** — 515-case matrix: all 15 system roles × 11 spotlight permissions × refresh attestation, ALLOW/APPROVAL_REQUIRED/DENY effects, 8 override precedence combos × 8 permissions, mid-session permission/role changes, refresh expiry/revocation
- **`backend/tests/`** — Jest + Supertest suites (`npm run test`); legacy tsx suites via `npm run test:legacy`
- **`e2e/`** — Playwright browser E2E (`npm run test:e2e`); HTML report in `playwright-report/`
- **`src/app.ts`** — exported Express factory for Supertest
- Fixed fresh-database migration order for `user_sessions` table

### Documentation

- README, ENTITIES, and CHANGELOG updated for 2.1.0

---

## [2.0.0] — 2026-09-05

Major release: multi-workspace architecture, tri-state RBAC, approval workflows, teams, and server-authoritative security.

### Added

#### Application & navigation
- Auth-first routing with return-URL preservation after login
- Workspace selector, switcher, and onboarding for users without a workspace
- Invite landing pages (`/invite/:token`, `/join/:code`)
- `WorkspaceRouteGuard` for workspace-scoped URLs
- Active workspace context drives all permissions and data scope

#### Authorization & permissions
- Tri-state role permissions: `allow` · `approval_required` · `deny` (`role_permissions.effect`)
- Per-member permission overrides (`grant` / `deny` on `workspace_member_permissions`)
- Owner-controlled admin approval authority (`approval.decide.*` permissions)
- Centralized `AuthorizationService.authorize()` on protected API routes
- `security_version` per workspace membership; bumped on auth-affecting changes
- `GET /workspaces/:id/permissions/me` returns effective permissions + `security_version`

#### Approvals
- Approval request lifecycle: pending → approved / rejected / cancelled / expired / executed
- Members submit approval requests when an action is `APPROVAL_REQUIRED`
- Deciders re-validated at decision time (not only at request creation)
- Optimistic locking on approve/reject (409 on concurrent decision)
- Realtime `approvals:changed` events and `ApprovalsContext` on the frontend

#### Teams
- `workspace_teams` and `team_members` with optional team lead
- Team join request workflow (`team_membership_requests`) with approve/reject/reapply
- Team-to-entity assignments (`team_assignments` → task, issue, subtask)
- Teams UI and team-scoped authority checks on the backend

#### Security & sessions
- Server-side session registry (`user_sessions`); JWT may include `sid`
- Session revocation on logout; revoked sessions return 401
- Append-only security audit log (`security_events`) with SHA-256 hash chain
- Owner **Security Center** UI (`/security`) and `GET /api/security/workspaces/:id/events`
- Request correlation via `X-Request-Id` on every API request/response
- Rate limiting on auth and approval endpoints
- Security headers (HSTS in production, frame protection, nosniff)
- `npm run security-test` — automated authorization boundary tests
- `npm run reset-db` — reset SQLite and re-seed demo data

#### Realtime (Socket.IO)
- `permissions:updated` — permission list changed
- `security.changed` — security version bumped (role, membership, admin authority, access revoked)
- `approvals:changed` — approval submitted or decided
- Authenticated connections; `workspace:subscribe` validates membership before joining workspace room

#### UI
- `UserAccessPanel` — effective permissions and approval authority in Settings
- Permission matrix and member override management (owner)
- Live approval badge on permissions page

### Changed

- **Backend is the source of truth** for roles, permissions, workspace membership, and approval authority
- **Workspace context required** — entity APIs verify resource belongs to the active workspace
- **Admin authority is delegated** by the workspace owner (no implicit unrestricted admin access)
- **Permission changes apply immediately** — no logout or refresh required (realtime + `security_version`)
- **403 responses** may include `permission`, `approval_available`, `requires_approval`, `security_version`, `requestId`
- **Login/register** create tracked sessions and security audit events
- **Version display** reads from `package.json` via `version.ts` (backend + frontend)

### Security

- Server-authoritative permission resolution on every protected operation
- Cross-workspace resource validation (out-of-scope resources return 404)
- Privilege escalation protection — owner-only permission override endpoints
- User-Agent and server UTC timestamps on security events
- Production-safe 500 errors (no stack traces); JSON body limit 1 MB
- Client sends optional `X-Workspace-Security-Version` header (logged on mismatch; backend still resolves fresh)

### Fixed

- Workspace route guard for cross-workspace URL access
- Provider ordering so workspace context loads before permission gates
- Role permission dropdown CSS width
- Approval flow concurrency and TypeScript issues

### Breaking changes

| Area | Before (1.x) | After (2.0) |
|------|--------------|-------------|
| Navigation | Login → dashboard | Login → workspace selection → scoped app |
| Permissions | Boolean grant/deny | Tri-state `ALLOW` / `APPROVAL_REQUIRED` / `DENY` |
| Admin access | Broad implicit admin powers | Owner-configured role effects + per-user overrides |
| Sensitive actions | Execute or hard deny | May return 403 + `approval_available: true` |
| Sessions | JWT only | JWT + server session (`sid`); revocation on logout |
| API errors | Plain error message | Structured fields + `requestId` |
| Database | Basic RBAC tables | + sessions, security events, teams workflow, approval extensions |
| Realtime | Notifications only | + permissions, security, approvals events |

### Migration

1. Stop the backend.
2. Pull/update code and run `npm run install:all`.
3. Start the backend — `initDb()` runs migrations automatically.
   - **Or** run `npm run reset-db` for a clean demo database (backend must be stopped).
4. Users should **sign in again** for session-tracked tokens.
5. Existing `role_permissions` rows default to `effect = 'allow'`.
6. Permissions not in the role matrix resolve to **DENY** (no automatic `APPROVAL_REQUIRED` from old `false` values).

See [ENTITIES.md — What changed in 2.0](ENTITIES.md#what-changed-in-20) for table-level detail.

---

## [1.1.0] — (internal, superseded)

Intermediate development version during the RBAC and workspace refactor. Not a public release. Superseded by **2.0.0**.

---

## [1.0.0] — Initial release

- Tasks, issues, subtasks, comments, files, timesheets
- Basic workspace support and JWT authentication
- Role-based permissions (boolean grant model)
- Notifications and activity logging
- Socket.IO for notifications

---

## Version policy

| Bump | When |
|------|------|
| **MAJOR** | Incompatible architecture or API/behavior changes (e.g. 1.x → 2.0) |
| **MINOR** | New backward-compatible features |
| **PATCH** | Bug fixes and security patches without behavior changes |

Current release: **2.1.0** (root, frontend, and backend `package.json` are kept in sync).
