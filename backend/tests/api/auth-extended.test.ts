import {
  createApiAgent,
  extractRefreshCookie,
  authHeader,
  cookieHeader,
} from "../helpers/apiAgent.js";
import { uniqueId } from "../setup/fixtures.js";

describe("auth API extended", () => {
  const agent = createApiAgent();

  async function registerUser(prefix: string) {
    const id = uniqueId(prefix);
    const res = await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" })
      .expect(201);
    return { id, res };
  }

  it("GET /sessions lists active sessions with current flag", async () => {
    const { res } = await registerUser("sess");
    const token = res.body.accessToken as string;

    const sessionsRes = await agent
      .get("/api/auth/sessions")
      .set(authHeader(token))
      .expect(200);

    expect(Array.isArray(sessionsRes.body.sessions)).toBe(true);
    expect(sessionsRes.body.sessions.length).toBeGreaterThan(0);
    expect(sessionsRes.body.sessions.some((s: { is_current: boolean }) => s.is_current)).toBe(true);
  });

  it("POST /logout-all revokes other sessions but keeps current", async () => {
    const { id, res: regRes } = await registerUser("logoutall");
    const firstToken = regRes.body.accessToken as string;

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: id, password: "TestPass1" })
      .expect(200);
    const currentToken = loginRes.body.accessToken as string;

    await agent
      .post("/api/auth/logout-all")
      .set(authHeader(currentToken))
      .expect(204);

    await agent.get("/api/users/me").set(authHeader(firstToken)).expect(401);
    await agent.get("/api/users/me").set(authHeader(currentToken)).expect(200);
  });

  it("POST /login rejects missing password", async () => {
    const { id } = await registerUser("nopw");
    await agent.post("/api/auth/login").send({ username: id }).expect(400);
  });

  it("POST /refresh without cookie returns 401", async () => {
    const res = await agent.post("/api/auth/refresh").expect(401);
    expect(res.body.error).toMatch(/refresh session/i);
  });

  it("POST /refresh rejects untrusted Origin (CSRF)", async () => {
    const { res } = await registerUser("csrf");
    const cookie = extractRefreshCookie(res)!;

    await agent
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader(cookie))
      .set("Origin", "https://evil.example.com")
      .expect(403);
  });

  it("POST /logout rejects untrusted Origin (CSRF)", async () => {
    const { res } = await registerUser("csrf_logout");
    const cookie = extractRefreshCookie(res)!;

    await agent
      .post("/api/auth/logout")
      .set("Cookie", cookieHeader(cookie))
      .set("Origin", "https://evil.example.com")
      .expect(403);
  });

  it("POST /refresh rotates tokens successfully", async () => {
    const { res } = await registerUser("refresh_ok");
    const cookie = extractRefreshCookie(res)!;

    const refreshRes = await agent
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader(cookie))
      .expect(200);

    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.user).toBeDefined();
    const newCookie = extractRefreshCookie(refreshRes);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(cookie);

    await agent
      .get("/api/users/me")
      .set(authHeader(refreshRes.body.accessToken as string))
      .expect(200);
  });

  it("POST /refresh detects refresh token reuse", async () => {
    const { res } = await registerUser("refresh_reuse");
    const originalCookie = extractRefreshCookie(res)!;

    const rotated = await agent
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader(originalCookie))
      .expect(200);
    expect(extractRefreshCookie(rotated)).toBeDefined();

    const reuseRes = await agent
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader(originalCookie))
      .expect(401);

    expect(reuseRes.body.error).toMatch(/reuse/i);
  });

  it("POST /logout revokes session via refresh cookie", async () => {
    const { res } = await registerUser("logout_cookie");
    const cookie = extractRefreshCookie(res)!;
    const token = res.body.accessToken as string;

    await agent.post("/api/auth/logout").set("Cookie", cookieHeader(cookie)).expect(204);

    await agent.get("/api/users/me").set(authHeader(token)).expect(401);
    await agent.post("/api/auth/refresh").set("Cookie", cookieHeader(cookie)).expect(401);
  });

  it("POST /logout revokes session via bearer token", async () => {
    const { res } = await registerUser("logout_bearer");
    const cookie = extractRefreshCookie(res)!;
    const token = res.body.accessToken as string;

    await agent
      .post("/api/auth/logout")
      .set("Cookie", cookieHeader(cookie))
      .set(authHeader(token))
      .expect(204);

    await agent.get("/api/users/me").set(authHeader(token)).expect(401);
  });
});
