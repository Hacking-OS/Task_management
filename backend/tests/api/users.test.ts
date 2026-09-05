import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import { createTestUser } from "../setup/fixtures.js";

describe("GET /api/users/me", () => {
  const agent = createApiAgent();

  it("returns current user when authenticated", async () => {
    const user = createTestUser("me_user");
    const res = await agent.get("/api/users/me").set(authHeader(user.accessToken)).expect(200);

    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.username).toBe(user.username);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("returns 401 without auth", async () => {
    await agent.get("/api/users/me").expect(401);
  });
});

describe("POST /api/users/me/avatar", () => {
  const agent = createApiAgent();

  it("returns 400 when no file is uploaded", async () => {
    const user = createTestUser("avatar_no_file");
    await agent.post("/api/users/me/avatar").set(authHeader(user.accessToken)).expect(400);
  });

  it("uploads avatar via multipart buffer and serves it", async () => {
    const user = createTestUser("avatar_upload");
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const uploadRes = await agent
      .post("/api/users/me/avatar")
      .set(authHeader(user.accessToken))
      .attach("file", pngBuffer, { filename: "avatar.png", contentType: "image/png" })
      .expect(200);

    expect(uploadRes.body.avatar_url).toBe(`/api/users/${user.id}/avatar`);
    expect(uploadRes.body.user.avatar_url).toBe(`/api/users/${user.id}/avatar`);

    const avatarRes = await agent.get(`/api/users/${user.id}/avatar`).expect(200);
    expect(avatarRes.headers["content-type"]).toMatch(/image\/png/);
    expect(Buffer.isBuffer(avatarRes.body) || typeof avatarRes.body === "object").toBe(true);
  });
});

describe("GET /api/users/:userId/avatar", () => {
  const agent = createApiAgent();

  it("returns 404 when user has no avatar", async () => {
    const user = createTestUser("avatar_missing");
    await agent.get(`/api/users/${user.id}/avatar`).expect(404);
  });
});
