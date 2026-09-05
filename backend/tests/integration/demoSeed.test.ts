import { db } from "../../src/db.js";
import { seedDemoData, DEMO_PASSWORD } from "../../src/services/demoSeed.js";

describe("demo seed", () => {
  it("seedDemoData creates demo user and Acme workspace on fresh database", () => {
    seedDemoData();

    const demoUser = db.prepare("SELECT id, username, email FROM users WHERE username = ?").get("demo") as
      | { id: string; username: string; email: string }
      | undefined;
    expect(demoUser).toBeDefined();
    expect(demoUser!.email).toBe("demo@acme.local");

    const workspace = db.prepare("SELECT id, name FROM workspaces WHERE name = ?").get("Acme Software") as
      | { id: string; name: string }
      | undefined;
    expect(workspace).toBeDefined();

    const membership = db.prepare(`
      SELECT wm.id FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE u.username = ? AND wm.workspace_id = ?
    `).get("demo", workspace!.id);
    expect(membership).toBeDefined();

    // Idempotent: second call should not throw
    expect(() => seedDemoData()).not.toThrow();

    void DEMO_PASSWORD;
  });
});
