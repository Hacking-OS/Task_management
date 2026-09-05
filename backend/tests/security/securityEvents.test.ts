import { listSecurityEvents } from "../../src/services/securityEvents.js";
import { createApiAgent } from "../helpers/apiAgent.js";
import { uniqueId } from "../setup/fixtures.js";

describe("security events", () => {
  it("logs failed login attempt", async () => {
    const agent = createApiAgent();
    const before = listSecurityEvents({ limit: 100 }).length;

    await agent.post("/api/auth/login").send({ username: "nonexistent_user", password: "WrongPass1" });

    const after = listSecurityEvents({ limit: 100 }) as { action?: string; result?: string }[];
    expect(after.length).toBeGreaterThanOrEqual(before);
    const failed = after.find((e) => e.action === "LOGIN_FAILED" || e.result === "DENIED");
    expect(failed).toBeDefined();
    expect(JSON.stringify(failed)).not.toMatch(/password/i);
  });

  it("register failure on duplicate does not expose password hash", async () => {
    const agent = createApiAgent();
    const id = uniqueId("sec_dup");
    await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" });

    const res = await agent
      .post("/api/auth/register")
      .send({ username: id, email: `${id}@test.local`, password: "TestPass1" })
      .expect(400);

    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });
});
