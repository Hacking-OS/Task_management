# Backend Jest tests

Jest + Supertest architecture for code-level, API, and integration testing.

**App version:** aligned with package `2.1.1`.

## Layout

```
tests/
├── unit/
│   ├── validation/          DTO / validator tests
│   ├── middleware/          Auth, rate limit, workspace auth, request context
│   ├── routes/              Route error-path coverage (mocked services)
│   └── services/            Authorization / socket security unit tests
├── permissions/             Permission resolver matrix
├── security/                Rate limits, security events
├── api/                     Supertest HTTP route tests (auth, workspaces, collab, …)
├── integration/             Services, approvals, invitations, notifications, coverage suites
├── setup/                   DB env, fixtures, Jest setup, version mock
└── helpers/                 API agent utilities
```

Legacy tsx QA suites remain in `src/tests/` — run via `npm run test:legacy`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run test` | All Jest suites |
| `npm run test:unit` | Unit tests under `tests/unit` |
| `npm run test:api` | Supertest route tests |
| `npm run test:security` | Security + permissions |
| `npm run test:integration` | Service integration + coverage suites |
| `npm run test:coverage` | Jest with coverage report (`coverage/`) |
| `npm run coverage:sync-thresholds` | Rewrite `coverage-thresholds.cjs` from measured summary |
| `npm run test:legacy` | Original tsx QA orchestrator |

## Coverage thresholds (2.1.1)

Jest loads floors from **`coverage-thresholds.cjs`** (imported by `jest.config.cjs`).

That file is **auto-generated** from `coverage/coverage-summary.json` so numbers match a real run — do not invent thresholds by hand.

```powershell
npm run test:coverage
npm run coverage:sync-thresholds
```

Typical measured floors after the 2.1.1 expansion (re-sync after changes):

| Area | Lines (approx.) |
|------|-----------------|
| `src/middleware/` | 100% |
| `src/permissions/` | 100% |
| `src/validation/` | 100% |
| `src/routes/` | 100% |
| `src/services/` | ~99.8% |

Open `coverage/lcov-report/index.html` for file-level detail.

## Test database

Jest uses an in-memory SQLite database (`TEST_DB_PATH=:memory:`) with no demo seed.
Fixtures create isolated users/workspaces per test via `tests/setup/fixtures.ts`.

## Supertest

Express app is exported from `src/app.ts` via `createApp()` for in-process HTTP testing.
