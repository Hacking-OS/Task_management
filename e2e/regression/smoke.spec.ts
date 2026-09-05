import { test, expect } from "@playwright/test";
import { AppShell } from "../pages/AppPages.js";

test.describe("Regression smoke", () => {
  test("core pages render without errors", async ({ page }) => {
    const app = new AppShell(page);
    await app.gotoDashboard();
    await app.gotoProjects();
    await app.gotoTeams();
    await app.gotoSettings();
    await expect(page.locator(".page-header").first()).toBeVisible();
  });

  test("normal navigation does not trigger 429 rate limits", async ({ page }) => {
    const rateLimited: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 429 && !res.url().includes("/api/auth/refresh")) {
        rateLimited.push(res.url());
      }
    });

    const app = new AppShell(page);
    await app.gotoDashboard();
    await app.gotoProjects();
    await app.gotoTeams();
    await page.goto("/tasks");
    await page.waitForSelector(".data-table, .page-header", { timeout: 15_000 });
    await page.goto("/notifications");
    await page.waitForSelector(".page-header, .notification", { timeout: 15_000 }).catch(() => {});

    expect(rateLimited).toEqual([]);
  });

  test("duplicate API calls stay bounded on dashboard reload", async ({ page }) => {
    const counts = new Map<string, number>();
    page.on("response", (res) => {
      const url = res.url();
      if (url.includes("/api/workspaces") || url.includes("/api/users/me")) {
        counts.set(url, (counts.get(url) ?? 0) + 1);
      }
    });

    await page.goto("/dashboard");
    await page.waitForSelector(".stat-card, .page-header", { timeout: 15_000 });
    await page.reload();
    await page.waitForSelector(".stat-card, .page-header", { timeout: 15_000 });

    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(4);
    }
  });
});
