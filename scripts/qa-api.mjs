/**
 * API smoke tests for QA — requires running backend on :4000 with demo seed.
 * Usage: node scripts/qa-api.mjs
 */
const BASE = process.env.API_URL ?? "http://localhost:4000";

let cookieJar = "";

function storeCookies(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return;
  const parts = raw.split(/,(?=\s*[^;]+=[^;]+)/);
  const map = new Map(
    cookieJar
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i), c.slice(i + 1)];
      })
  );
  for (const part of parts) {
    const segment = part.split(";")[0].trim();
    const i = segment.indexOf("=");
    if (i > 0) map.set(segment.slice(0, i), segment.slice(i + 1));
  }
  cookieJar = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(method, path, { token, body, expect, cookies = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookies && cookieJar) headers.Cookie = cookieJar;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (expect !== undefined && res.status !== expect) {
    throw new Error(`${method} ${path} expected ${expect}, got ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, data, headers: res.headers };
}

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}
function fail(label, err) {
  failed++;
  console.error(`  ✗ ${label}: ${err}`);
}

async function run() {
  console.log("API QA smoke tests\n");

  try {
    await req("POST", "/api/auth/login", { body: { username: "demo", password: "wrong" }, expect: 401 });
    ok("Login invalid password → 401");
  } catch (e) {
    fail("Login invalid password", e.message);
  }

  let accessToken;
  try {
    const { data } = await req("POST", "/api/auth/login", {
      body: { username: "demo", password: "demo1234" },
      expect: 200,
      cookies: true,
    });
    accessToken = data.accessToken;
    if (data.refreshToken) throw new Error("Response must not contain refreshToken");
    if (!cookieJar.includes("refresh_token=")) throw new Error("HttpOnly refresh cookie not set");
    ok("Login demo user → 200 + accessToken + refresh cookie");
  } catch (e) {
    fail("Login demo user", e.message);
    process.exit(1);
  }

  try {
    await req("GET", "/api/users/me", { expect: 401 });
    ok("GET /me without token → 401");
  } catch (e) {
    fail("GET /me without token", e.message);
  }

  let userId;
  try {
    const { data } = await req("GET", "/api/users/me", { token: accessToken, expect: 200 });
    userId = data.user.id;
    ok("GET /me with access token → 200");
  } catch (e) {
    fail("GET /me with token", e.message);
  }

  try {
    const { data } = await req("POST", "/api/auth/refresh", { expect: 200, cookies: true });
    if (data.refreshToken) throw new Error("Refresh response must not contain refreshToken");
    if (!data.accessToken) throw new Error("Refresh must return accessToken");
    accessToken = data.accessToken;
    ok("POST /auth/refresh with cookie → new accessToken");
  } catch (e) {
    fail("POST /auth/refresh", e.message);
  }

  try {
    await req("POST", "/api/auth/logout", { token: accessToken, expect: 204, cookies: true });
    ok("Logout → 204");
  } catch (e) {
    fail("Logout", e.message);
  }

  try {
    await req("POST", "/api/auth/refresh", { expect: 401, cookies: true });
    ok("Refresh after logout → 401");
  } catch (e) {
    fail("Refresh after logout", e.message);
  }

  try {
    await req("GET", "/api/users/me", { token: "invalid.token.here", expect: 401 });
    ok("Invalid bearer token → 401");
  } catch (e) {
    fail("Invalid bearer token", e.message);
  }

  if (userId) {
    try {
      const { data: loginAgain } = await req("POST", "/api/auth/login", {
        body: { username: "demo", password: "demo1234" },
        expect: 200,
        cookies: true,
      });
      const wsRes = await req("GET", "/api/workspaces", {
        token: loginAgain.accessToken,
        expect: 200,
      });
      if (!Array.isArray(wsRes.data.workspaces)) throw new Error("Expected workspaces array");
      ok("GET /workspaces after re-login → 200");
    } catch (e) {
      fail("GET /workspaces", e.message);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
