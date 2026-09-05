# Jellyfish Workspace (TMS)

**Version 2.1.1**

A full-stack **Task Management System** for multi-workspace teams — manage **tasks**, **issues**, **subtasks**, **files**, **timesheets**, **notifications**, and **activity** with tri-state RBAC, approval flows, teams, and server-authoritative security.

> **Disclaimer — overview only.** This README is provided for informational and overview purposes only. The software is supplied **as is**, with **no warranty or guarantee** of any kind, express or implied, including but not limited to fitness for a particular purpose, accuracy, availability, or uninterrupted operation. Use at your own risk.

See [CHANGELOG.md](CHANGELOG.md) for release notes and [ENTITIES.md](ENTITIES.md) for database entities, relationships, and structural overview.

| Layer | Stack |
|-------|--------|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Express, TypeScript, SQLite (`better-sqlite3`) |
| Realtime | Socket.IO |
| Auth | JWT + bcrypt + server-side session registry |
| Tests | Jest + Supertest (backend), RTL (frontend), Playwright E2E |

---

## What's new in 2.1.1

- **Backend test coverage** — routes at **100%** lines; services near **100%**; middleware / permissions / validation at **100%**
- **Honest coverage thresholds** — `coverage-thresholds.cjs` generated from measured reports (`npm run coverage:sync-thresholds`)
- **Project / team detail loading** — separate async sessions so list reloads no longer cancel detail fetches
- **Timesheet day panel** — days with logged time open a side drawer; owners/admins can accept or reject for billing
- **Billing placeholder** — `/billing` “In development” page (owner/admin nav)

See [CHANGELOG.md](CHANGELOG.md) for the full 2.1.1 notes.

## What's new in 2.1.0

- **Projects** — workspace-scoped projects with direct members, team assignments, and project lead
- **Multi-team / multi-project membership** — users join many teams and many projects via junction tables (no `user.teamId` / `user.projectId`)
- **Project access resolver** — direct membership ∪ team-derived access; owner oversight
- **Owner management** — project list, member summary (teams + projects), workspace overview aggregates
- **Teams & Projects UI** — professional master-detail layout, tables, stat cards, stable async loading
- **Timesheet calendar** — month grid with daily totals and day filtering
- **Entity type badges** — color-coded Task / Issue / Subtask labels
- **API efficiency** — shared Socket.IO connection, request deduplication, reduced duplicate fetches

See [CHANGELOG.md](CHANGELOG.md) for the full 2.1.0 release notes. For the 2.0 platform release, see **What's new in 2.0.0** below.

## What's new in 2.0.0

- **Workspace-first flow** — sign in, select or create a workspace, then access scoped data
- **Tri-state permissions** — each capability is `ALLOW`, `APPROVAL_REQUIRED`, or `DENY`
- **Approval workflows** — members request permission; owner/authorized admins decide
- **Owner-controlled admin authority** — per-admin overrides and approval-decide permissions
- **Teams** — team leads, join requests, team-to-task/issue/subtask assignments
- **Realtime sync** — permission, approval, and security changes propagate via Socket.IO
- **Security hardening** — centralized authorization, session revocation, audit events, rate limiting

---

## Quick start

```powershell
# From project root
npm run install:all
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000/api |
| Health / version | http://localhost:4000/api/health · http://localhost:4000/api/version |

Build for production:

```powershell
npm run build
npm run start --prefix backend
npm run preview --prefix frontend
```

### Reset demo database

Stop the backend first, then:

```powershell
npm run reset-db
```

This recreates `backend/data/app.db` with demo workspaces, users, teams, tasks, and permissions.

### Security tests

```powershell
npm run security-test --prefix backend
```

Runs authorization boundary checks against the demo seed (requires migrations applied).

### Backend Jest tests & coverage

```powershell
# From backend/
npm run test                 # all Jest suites
npm run test:coverage        # coverage report under coverage/
npm run coverage:sync-thresholds   # update committed floors from measured report
```

Coverage floors live in `backend/coverage-thresholds.cjs` and are **generated from** `coverage/coverage-summary.json` — not hand-tuned. After improving coverage, re-run `test:coverage` then `coverage:sync-thresholds`.

See `backend/tests/README.md` for layout and suite commands.

From the project root you can also run:

```powershell
npm run test:coverage
npm run test:api
npm run test:integration
```

## Application flow

```
Sign in
  → Workspace selector (or auto-activate if only one workspace)
  → Active workspace context
  → Dashboard, tasks, issues, teams, permissions, etc.
```

- All **permissions**, **roles**, and **teams** are scoped to the **active workspace**
- Switching workspaces reloads permissions and realtime subscriptions
- If workspace access is revoked, the app clears cached data and returns to the workspace selector

---

## Demo accounts

All demo users share password **`demo1234`**.

| Username | Role / purpose |
|----------|----------------|
| `demo` | Owner of **Acme Software** (primary demo workspace) |
| `alex.admin` | Admin at Acme |
| `freelancer` | Member at Acme |
| `startup` | Owner of **Startup Labs** (second workspace) |
| `newuser` | No workspace — use invite code `ACMEJOIN` to join Acme |
| `dev.alice`, `qa.priya`, `pm.sarah`, … | Additional Acme roles — see `backend/src/services/demoSeed.ts` |

**Acme Software** is pre-seeded with users, teams, tasks, issues, subtasks, and a permission matrix.

---

## Project structure

```
PY-BOT/
├── backend/                    Express API + SQLite
│   ├── src/
│   │   ├── routes/             REST endpoints (auth, workspaces, security, …)
│   │   ├── services/           Business logic, authorization, approvals, teams
│   │   ├── middleware/         Auth, workspace permissions, rate limits, request IDs
│   │   ├── permissions/        Permission catalog
│   │   ├── migrate.ts          Schema migrations (run on startup)
│   │   ├── tests/              Legacy tsx QA suites (npm run test:legacy)
│   │   └── db.ts               Database init
│   ├── tests/                  Jest + Supertest suites (api, integration, unit)
│   ├── scripts/                e.g. sync-coverage-thresholds.cjs
│   ├── coverage-thresholds.cjs Generated coverage floors (do not edit by hand)
│   └── data/
│       ├── app.db              SQLite database (auto-created)
│       └── uploads/            Per-workspace file storage
├── frontend/                   React SPA
│   └── src/
│       ├── pages/              App screens (tasks, timesheets, billing, projects, …)
│       ├── context/            Auth, workspace, permissions, approvals, notifications
│       ├── shared/             PermissionGate, WorkspaceSwitcher, assignee pickers, …
│       └── services/api.ts     API client
├── CHANGELOG.md
├── ENTITIES.md              Database entities, relationships & 2.0 structure
├── package.json                Root scripts (dev, build, reset-db, test:*)
└── README.md
```

---

## Features

### Workspaces
- Create workspaces with **name + description** — uploads stored under `data/uploads/{workspaceId}`
- Workspace selector, switcher, and onboarding for new users
- Workspace overview, members, invitations, roles, and permission matrix
- Owner-only **Security Center** for audit event monitoring

### Work management
- **Tasks** — status, priority, severity, due dates, multi-assignee, subtasks, comments, attachments
- **Issues** — severity, status workflow, assignees, linked subtasks
- **Subtasks** — attach to tasks or issues
- **Assignments** — unified view of assigned work items

### Collaboration
- **Comments** on tasks, issues, and subtasks
- **Notifications** — assignments, CRUD, comments, files, permission changes
- **Activity log** — workspace and entity-level history
- **Approvals** — request and decide permission grants; realtime pending counts and toasts

### Teams
- Create teams with optional **team lead**
- **Join requests** — members request to join; team lead approves or rejects
- **Team assignments** — link teams to tasks, issues, and subtasks
- **Multi-team membership** — a user may belong to many teams in the same workspace
- Team detail shows members, assigned projects, and join requests
- Team-scoped authority enforced on the backend

### Projects *(2.1)*
- Create and manage **workspace projects** (active / archived)
- **Direct project members** with roles: lead, member, reviewer
- **Project ↔ team many-to-many** — assign multiple teams per project
- **Effective project access** — direct membership or membership in an assigned team
- Project overview stats (open tasks, issues, team/member counts)
- Permissions: `project.view`, `project.create`, `project.manage_members`, `project.assign_teams`, …

### Other
- **Dashboard** — stats, severity charts, completion progress, recent activity
- **Files** — upload/download attachments per entity
- **Timesheets** — log hours against tasks, issues, or subtasks; **calendar** with day side panel
- **Timesheet billing review** *(2.1.1)* — owners/admins accept or reject day entries for billing (client-side until billing APIs ship)
- **Billing** *(2.1.1)* — `/billing` placeholder marked **In development**
- **Settings** — profile avatar, account info, application version, active workspace details, effective permissions
- **Toasts** — success/error/warning feedback across operations

---

## Permissions (RBAC)

Each workspace has system roles (Owner, Admin, Member, custom roles) and a configurable permission matrix.

### Tri-state effects

| Effect | Behavior |
|--------|----------|
| **ALLOW** | User may perform the action immediately |
| **APPROVAL_REQUIRED** | User must submit an approval request; an authorized decider approves or rejects |
| **DENY** | Action is blocked |

The **workspace owner** controls:
- Role permission effects (bulk matrix)
- Per-member permission overrides (grants and denies)
- Which admins may **decide** approvals (`approval.decide.*` permissions)

### Frontend vs backend

- **Frontend** (`PermissionGate`, permissions context) — hides/disables UI for better UX
- **Backend** (`AuthorizationService`) — **always** re-resolves permissions from the database on every protected operation

Frontend state, JWT claims, and WebSocket subscriptions are **not** security boundaries.

### Examples

`task.view`, `task.create`, `task.delete`, `issue.edit`, `member.view`, `team.manage`, `approval.decide.task.delete`, `workspace.delete`, `file.upload`, `activity.view`

---

## Security

| Capability | Description |
|------------|-------------|
| Centralized authorization | `authorize()` resolves user + workspace + permission + resource scope |
| Security versioning | `security_version` per membership; bumped when roles/permissions change |
| Session registry | Server-side sessions; logout revokes; reused revoked tokens return 401 |
| Realtime revocation | `security.changed` / `permissions:updated` events; no logout required |
| Audit events | Append-only `security_events` log with tamper-evident hash chain |
| Request correlation | Every API request gets `X-Request-Id` |
| Rate limiting | Auth and approval endpoints throttled |
| Cross-workspace protection | Entity operations verify resource belongs to the workspace |

Owners can review events at **Security → Security Center** (`/security`).

---

## Realtime (Socket.IO)

Authenticated connections join `user:{userId}`. Workspace channels require an explicit subscribed workspace after membership is verified.

| Event | Purpose |
|-------|---------|
| `permissions:updated` | Permission list changed for active workspace |
| `security.changed` | Security version bumped (role, membership, admin authority, access revoked) |
| `approvals:changed` | Approval submitted, approved, rejected, or executed |
| `notification:new` | New notification + unread count |

---

## API overview

| Area | Base path |
|------|-----------|
| Auth | `/api/auth` (login, register, logout, sessions) |
| Users | `/api/users` |
| Workspaces | `/api/workspaces` |
| Roles, members, permissions, approvals, teams, **projects** | `/api/workspaces/:id/...` |
| Security events (owner) | `/api/security/workspaces/:id/events` |
| Tasks | `/api/tasks` |
| Issues | `/api/issues` |
| Subtasks | `/api/subtasks` |
| Comments | `/api/comments` |
| Notifications | `/api/notifications` |
| Activity | `/api/activity-logs` |
| Stats | `/api/stats` |
| Files | `/api/workspaces/:id/files`, `/api/files/:id` |
| Timesheets | `/api/workspaces/:id/time-entries` |
| Projects | `/api/workspaces/:id/projects`, `.../projects/:projectId/members`, `.../teams` |
| Workspace overview | `/api/workspaces/:id/overview` |
| Member summary | `/api/workspaces/:id/members/:memberId/summary` |
| Version | `/api/version` |

All protected routes require `Authorization: Bearer <token>`.

Workspace-scoped operations validate that the authenticated user is a member and that resources belong to the requested workspace. Denied requests may include `permission`, `approval_available`, `security_version`, and `requestId`.

**Note:** Application version `2.1.1` does **not** change URL paths — routes remain `/api/*` (no `/api/v2`). Frontend billing UI is at `/billing` (placeholder).

---

## Upgrading from 1.x

1. **Stop the backend**, pull/update code, run `npm run install:all`.
2. **Start the backend** — migrations run automatically on startup (`initDb()`).
   - For a clean demo environment: `npm run reset-db` (backend must be stopped).
3. **Users should sign in again** to receive session-tracked tokens.
4. **Review role permissions** — existing grants default to `ALLOW`; configure `APPROVAL_REQUIRED` / `DENY` as needed.
5. See [CHANGELOG.md](CHANGELOG.md) for breaking changes and full migration notes.

---

## Screenshots

25 UI screenshots (demo account `demo` / `demo1234`) live in [`screenshots/`](screenshots/) — including permissions, **approval flows**, task/issue detail, teams/projects, timesheet day panel, billing, and security. Index: [`screenshots/README.md`](screenshots/README.md).

```powershell
npm run capture:screenshots
# if Vite is not on 5173:
# $env:APP_URL="http://localhost:5175"; npm run capture:screenshots
```

Requires Chromium once: `npx playwright install chromium`.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Backend port |
| `JWT_SECRET` | dev default | **Required in production** — startup fails if unset |
| `ACCESS_TOKEN_TTL` | `24h` | JWT access token lifetime |
| `NODE_ENV` | — | Set to `production` for HSTS and safe error responses |

Database and uploads are stored under `backend/data/` relative to the backend working directory.

---

## Scripts (root)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend concurrently |
| `npm run build` | Build backend and frontend |
| `npm run install:all` | Install dependencies in backend and frontend |
| `npm run reset-db` | Reset SQLite database and re-seed demo data |
| `npm run test` | Backend + frontend Jest |
| `npm run test:coverage` | Backend Jest with coverage |
| `npm run test:api` / `test:integration` | Backend API / integration suites |
| `npm run test:e2e` | Playwright E2E |

---

## Disclaimer

This document and the associated project are **for overview and reference only**. They do not constitute a commitment, service level agreement, or support offering.

THE SOFTWARE IS PROVIDED **“AS IS”**, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM USE OF THIS SOFTWARE.

---

## License

Private project — internal use. No warranty or guarantee.
