# Backend test suites

All automated QA and security tests live in this folder.

## Run all suites

```bash
# From repo root
npm run test

# From backend
npm run test
```

## Run individual suites

| Command | File | Description |
|---------|------|-------------|
| `npm run test:security` | `securityTests.ts` | Security matrix (demo seed) |
| `npm run test:complex-qa` | `complexQaTests.ts` | Multi-workspace / multi-path scenarios |
| `npm run test:auth-security` | `authSecurityQaTests.ts` | Auth, invitations, approvals, audit |
| `npm run test:refresh-auth` | `refreshAuthQaTests.ts` | HttpOnly refresh token rotation |
| `npm run test:role-permission-refresh` | `rolePermissionRefreshQaTests.ts` | Role × permission × override × refresh (515+ cases) |

## Notes

- `securityTests.ts` expects demo seed data — run `npm run reset-db` first if needed.
- Other suites create and clean up isolated fixtures automatically.
