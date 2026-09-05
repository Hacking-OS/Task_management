/**
 * Refresh-token rotation & cookie-only auth tests.
 * Run: npm run refresh-auth-qa
 */
import { initDb, db } from "../db.js";
import {
  createAuthenticatedSession,
  rotateRefreshSession,
  revokeSession,
  RefreshTokenReuseError,
  hashToken,
} from "../services/sessions.js";
import { login, refreshSession } from "../services/auth.js";
import bcrypt from "bcryptjs";

let passed = 0;
let failed = 0;

function assert(condition: boolean, id: string, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${id}: ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${id}: ${label}`);
  }
}

function assertThrows(fn: () => unknown, id: string, label: string): void {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${id}: ${label} (expected throw)`);
  } catch {
    passed += 1;
    console.log(`  ✓ ${id}: ${label}`);
  }
}

console.log("Refresh auth QA tests\n");
initDb();

const userId = crypto.randomUUID();
const hash = bcrypt.hashSync("RefreshQa1", 10);
db.prepare("INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").run(
  userId,
  `refresh_qa_${userId.slice(0, 6)}`,
  `refresh_qa+${userId.slice(0, 8)}@test.local`,
  hash
);

try {
  const initial = createAuthenticatedSession(userId, "TestAgent", "127.0.0.1");
  assert(!!initial.refreshToken && !!initial.accessToken, "RT-001", "Session created with refresh + access");

  const row = db.prepare("SELECT refresh_token_hash, token_family_id FROM user_sessions WHERE id = ?").get(
    initial.session.id
  ) as { refresh_token_hash: string; token_family_id: string };
  assert(
    row.refresh_token_hash === hashToken(initial.refreshToken) && !!row.token_family_id,
    "RT-002",
    "Refresh token hash stored (not raw token)"
  );
  assert(
    !JSON.stringify({ refreshToken: initial.refreshToken }).includes(row.refresh_token_hash),
    "RT-099",
    "Hash differs from raw token"
  );

  const rotated = rotateRefreshSession(initial.refreshToken);
  assert(rotated.refreshToken !== initial.refreshToken, "RT-098", "Refresh token rotated");

  assertThrows(
    () => rotateRefreshSession(initial.refreshToken),
    "RT-101",
    "Reused old refresh token rejected"
  );

  const afterReuse = db.prepare("SELECT status FROM user_sessions WHERE id = ?").get(initial.session.id) as {
    status: string;
  };
  assert(afterReuse.status === "revoked", "RT-101b", "Token family revoked on reuse");

  const secondRotation = createAuthenticatedSession(userId, "TestAgent2");
  const rotated2 = rotateRefreshSession(secondRotation.refreshToken);
  assert(!!rotated2.accessToken, "RT-098b", "Second rotation on new session succeeds");

  const loginResult = login(`refresh_qa_${userId.slice(0, 6)}`, "RefreshQa1");
  assert(!!loginResult.accessToken && !!loginResult.refreshToken, "RT-086", "Login returns access + internal refresh");

  const refreshed = refreshSession(loginResult.refreshToken);
  assert(
    refreshed.sessionId === loginResult.sessionId && refreshed.refreshToken !== loginResult.refreshToken,
    "RT-119",
    "Refresh rotates refresh token for same session"
  );

  revokeSession(loginResult.sessionId, userId);
  assertThrows(
    () => refreshSession(loginResult.refreshToken),
    "RT-121",
    "Revoked session refresh denied"
  );
} catch (e) {
  console.error("Refresh auth QA fatal:", e);
  failed += 1;
} finally {
  db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
