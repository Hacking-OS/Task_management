import { test, expect } from "@playwright/test";

test.describe("Workspace isolation", () => {
  test("deep-link to fake workspace id shows safe failure", async ({ page }) => {
    await page.goto("/workspaces/00000000-0000-0000-0000-000000000099");
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toMatch(/passwordhash|refresh_token|secret/i);
    expect(page.url()).not.toContain("00000000");
  });
});
