import { createApiAgent, extractRefreshCookie, authHeader, cookieHeader } from "../helpers/apiAgent.js";
import { uniqueId } from "../setup/fixtures.js";

describe("POST /api/auth", () => {
  const agent = createApiAgent();

  it("register returns accessToken without refreshToken in JSON", async () => {
    const id = uniqueId("reg");
    const res = await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.username).toBe(id);
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.refreshTokenHash).toBeUndefined();
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(extractRefreshCookie(res)).toBeDefined();
  });

  it("login sets HttpOnly refresh cookie and omits refresh from body", async () => {
    const id = uniqueId("login");
    await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" });

    const res = await agent
      .post("/api/auth/login")
      .send({ username: id, password: "TestPass1" })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();
    const setCookieHeader = res.headers["set-cookie"];
    const setCookie = (Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader].filter(Boolean)).join(" ");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(extractRefreshCookie(res)).toBeDefined();
  });

  it("refresh rotates cookie and returns new access token", async () => {
    const id = uniqueId("refresh");
    const reg = await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" });
    const cookie = extractRefreshCookie(reg)!;

    const res = await agent
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader(cookie))
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(extractRefreshCookie(res)).toBeDefined();
    expect(extractRefreshCookie(res)).not.toBe(cookie);
  });

  it("logout clears session", async () => {
    const id = uniqueId("logout");
    const reg = await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" });
    const cookie = extractRefreshCookie(reg)!;
    const token = reg.body.accessToken as string;

    await agent.post("/api/auth/logout").set("Cookie", cookieHeader(cookie)).expect(204);

    await agent.get("/api/users/me").set(authHeader(token)).expect(401);
    await agent.post("/api/auth/refresh").set("Cookie", cookieHeader(cookie)).expect(401);
  });

  it("rejects invalid login credentials", async () => {
    await agent.post("/api/auth/login").send({ username: "nobody", password: "wrong" }).expect(401);
  });

  it("rejects signup with weak password", async () => {
    const id = uniqueId("weak");
    await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "short" })
      .expect(400);
  });
});

