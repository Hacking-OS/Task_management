import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/AppPages.js";

test.describe("Authentication", () => {
  test("HttpOnly refresh cookie is set and not in storage", async ({ browser }) => {
    const id = `cookie${Date.now().toString(36)}`;
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.request.post("http://localhost:4000/api/auth/register", {
      data: { username: id, email: `${id}@e2e.test`, password: "TestPass1" },
    });
    await new LoginPage(page).login(id, "TestPass1");

    const cookies = await context.cookies();
    const refresh = cookies.find((c) => c.name === "refresh_token" || c.name.includes("refresh"));
    expect(refresh).toBeDefined();
    expect(refresh?.httpOnly).toBe(true);

    const storage = await page.evaluate(() => localStorage.getItem("token") ?? localStorage.getItem("refreshToken"));
    expect(storage).toBeNull();
    await context.close();
  });

  test("browser refresh restores authenticated session", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector(".stat-card, .page-header", { timeout: 15_000 });
    await page.reload();
    await page.waitForSelector(".stat-card, .page-header", { timeout: 15_000 });
    await expect(page).not.toHaveURL(/login/);
  });

  test("unauthenticated user redirected from dashboard", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.waitForURL(/login/, { timeout: 15_000 });
    await context.close();
  });
});
