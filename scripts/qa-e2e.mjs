/**
 * Critical E2E flows — requires dev servers + demo seed.
 * Usage: npx playwright install chromium && node scripts/qa-e2e.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:5173";
const USER = "demo";
const PASS = "demo1234";

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
  console.log("E2E QA tests\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // Test 1: Login
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder("yourname or you@company.com").fill(USER);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('form.login-form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
    ok("Login → leaves login page");

    // Test 2: Dashboard loads
    await page.goto(`${BASE}/dashboard`);
    await page.waitForSelector(".stat-card, .page-header", { timeout: 15000 });
    ok("Dashboard → renders");

    // Test 3: Projects page
    await page.goto(`${BASE}/projects`);
    await page.waitForSelector(".resource-nav, .page-header", { timeout: 15000 });
    ok("Projects → renders");

    // Test 4: Teams page
    await page.goto(`${BASE}/teams`);
    await page.waitForSelector(".resource-nav, .page-header", { timeout: 15000 });
    ok("Teams → renders");

    // Test 5: Tasks page
    await page.goto(`${BASE}/tasks`);
    await page.waitForSelector(".data-table, .page-header", { timeout: 15000 });
    ok("Tasks → renders");

    // Test 6: Settings shows version
    await page.goto(`${BASE}/settings`);
    await page.waitForSelector("text=2.1.0", { timeout: 15000 });
    ok("Settings → shows version 2.1.0");

    // Test 7: Browser refresh restores auth
    await page.reload();
    await page.waitForSelector("text=2.1.0", { timeout: 15000 });
    ok("Refresh on settings → auth persists");

    // Test 8: Protected route without auth (new context)
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`${BASE}/dashboard`);
    await anonPage.waitForURL(/login/, { timeout: 15000 });
    ok("Unauthenticated /dashboard → redirects to login");
    await anon.close();

    const benign = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("DevTools") &&
        !e.includes("reportAllChanges") &&
        !e.includes("startTime")
    );
    if (benign.length === 0) {
      ok("No unexpected console errors during flows");
    } else {
      fail("Console errors", benign.slice(0, 3).join("; "));
    }
  } catch (e) {
    fail("E2E flow", e.message);
  } finally {
    await browser.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
