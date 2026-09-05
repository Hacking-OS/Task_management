/**
 * Capture module screenshots for README / docs.
 *
 * After the first UI login, the refresh cookie restores the session on full
 * navigations — we still prefer soft History API navigation so AuthContext
 * keeps the in-memory access token and we avoid extra login POSTs (rate limit).
 *
 * Usage:
 *   npm run capture:screenshots
 *   APP_URL=http://localhost:5175 CAPTURE_USER=demo CAPTURE_PASS=demo1234 node scripts/capture-screenshots.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "screenshots");
const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
const user = process.env.CAPTURE_USER || "demo";
const pass = process.env.CAPTURE_PASS || "demo1234";
const apiBase = process.env.API_URL || "http://localhost:4000";

fs.mkdirSync(outDir, { recursive: true });

async function api(pathname, token) {
  const res = await fetch(`${apiBase}${pathname}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${pathname} → ${res.status}`);
  return res.json();
}

async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: true,
  });
  console.log(`Saved ${name}.png`);
}

const idInput = 'form.login-form input[autocomplete="username"]';
const passInput = 'form.login-form input[type="password"]';

async function loginViaUi(page) {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(idInput, { timeout: 20000 });
  // Ensure Sign in tab (not the submit button)
  const signInTab = page.locator("button.tab-btn", { hasText: /^Sign in$/i });
  if (await signInTab.count()) await signInTab.click();

  await page.locator(idInput).fill("");
  await page.locator(idInput).pressSequentially(user, { delay: 15 });
  await page.locator(passInput).fill("");
  await page.locator(passInput).pressSequentially(pass, { delay: 15 });

  const loginRes = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
    { timeout: 30000 }
  );
  await page.locator('form.login-form button[type="submit"]').click();
  const res = await loginRes;
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Login failed HTTP ${res.status()}: ${body}`);
  }
  const data = await res.json();
  await page.waitForSelector(".app-layout", { timeout: 30000 });
  return data.accessToken;
}

/** Stay inside the SPA so AuthContext keeps the token. */
async function softGoto(page, routePath) {
  const hasApp = (await page.locator(".app-layout").count()) > 0;
  if (!hasApp) {
    await loginViaUi(page);
  }
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, routePath);
  await settle(page, 1200);
  // If soft nav did not render the route (still stuck), fall back to full goto + cookie restore
  const url = page.url();
  if (!url.includes(routePath.split("?")[0]) && !(await page.locator(".app-layout").count())) {
    await page.goto(`${appUrl}${routePath}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-layout", { timeout: 30000 });
    await settle(page, 800);
  }
}

async function main() {
  console.log(`Using APP_URL=${appUrl} user=${user}`);

  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".png")) fs.unlinkSync(path.join(outDir, f));
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  let ok = 0;
  let fail = 0;

  async function capture(name, routePath, after) {
    try {
      console.log(`→ ${name}: ${routePath}`);
      await softGoto(page, routePath);
      if (after) await after(page);
      await shot(page, name);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`Failed ${name}:`, err.message || err);
    }
  }

  // 01 — login screen (logged out)
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(idInput, { timeout: 20000 });
  await shot(page, "01-login");
  ok = 1;

  let accessToken;
  try {
    accessToken = await loginViaUi(page);
  } catch (err) {
    console.error("Initial login failed. Waiting 65s then retry…");
    console.error(err.message || err);
    await page.waitForTimeout(65000);
    accessToken = await loginViaUi(page);
  }
  console.log("Logged in.");

  let workspaceId = null;
  let taskId = null;
  let issueId = null;
  let teamId = null;
  let projectId = null;

  try {
    const wsPayload = await api("/api/workspaces", accessToken);
    const list = wsPayload.workspaces || [];
    const active = wsPayload.active;
    workspaceId = active?.id || list[0]?.id || null;
    console.log("Workspace id:", workspaceId);

    if (workspaceId) {
      const [tasks, issues, teams, projects] = await Promise.all([
        api(`/api/workspaces/${workspaceId}/tasks`, accessToken).catch(() => ({})),
        api(`/api/workspaces/${workspaceId}/issues`, accessToken).catch(() => ({})),
        api(`/api/workspaces/${workspaceId}/teams`, accessToken).catch(() => ({})),
        api(`/api/workspaces/${workspaceId}/projects`, accessToken).catch(() => ({})),
      ]);
      const asList = (x) => (Array.isArray(x) ? x : x?.items || x?.tasks || x?.issues || x?.teams || x?.projects || []);
      taskId = asList(tasks)[0]?.id || null;
      issueId = asList(issues)[0]?.id || null;
      teamId = asList(teams)[0]?.id || null;
      projectId = asList(projects)[0]?.id || null;
      console.log({ taskId, issueId, teamId, projectId });
    }
  } catch (err) {
    console.warn("API resolve warning:", err.message || err);
  }

  await capture("02-dashboard", "/dashboard");
  await capture("03-workspaces", "/workspaces");

  if (workspaceId) {
    await capture("04-workspace-detail", `/workspaces/${workspaceId}`);
    await capture("05-workspace-permissions", `/workspaces/${workspaceId}/permissions`);
    await capture("06-approvals", `/workspaces/${workspaceId}/permissions`, async (p) => {
      const tab = p.getByRole("button", { name: /Approval flows/i }).first();
      if (await tab.count()) {
        await tab.click();
        await settle(p, 900);
      }
    });
    await capture("07-permission-realtime", `/workspaces/${workspaceId}/permissions`, async (p) => {
      // Realtime approvals/permissions surface: stay on Approvals tab + Users banner
      const tab = p.getByRole("button", { name: /Approval flows/i }).first();
      if (await tab.count()) await tab.click();
      await settle(p, 700);
      const banner = p.locator(".info-banner, .perm-tabs, .user-access-panel").first();
      if (await banner.count()) await banner.scrollIntoViewIfNeeded().catch(() => {});
    });
  } else {
    console.warn("Skip workspace shots — no workspace id");
  }

  await capture("08-tasks", "/tasks");
  if (taskId) await capture("09-task-detail", `/tasks/${taskId}`);
  else console.warn("Skip 09-task-detail — no task id");

  await capture("10-issues", "/issues");
  if (issueId) await capture("11-issue-detail", `/issues/${issueId}`);
  else console.warn("Skip 11-issue-detail — no issue id");

  await capture("12-subtasks", "/subtasks");
  await capture("13-assignments", "/assignments");
  await capture("14-teams", "/teams");
  if (teamId) await capture("15-team-detail", `/teams/${teamId}`);
  else console.warn("Skip 15-team-detail — no team id");

  await capture("16-projects", "/projects");
  if (projectId) await capture("17-project-detail", `/projects/${projectId}`);
  else console.warn("Skip 17-project-detail — no project id");

  await capture("18-notifications", "/notifications");
  await capture("19-activity", "/activity");
  await capture("20-files", "/files");
  await capture("21-timesheets", "/timesheets");
  await capture("22-timesheet-day-panel", "/timesheets", async (p) => {
    const day = p.locator(".timesheet-calendar-day.has-hours").first();
    if (await day.count()) {
      await day.click();
      await p.waitForSelector(".timesheet-drawer", { timeout: 8000 }).catch(() => {});
      await settle(p, 800);
    } else {
      // Open any day so the panel UX is still visible if demo has sparse data
      const any = p.locator(".timesheet-calendar-day:not(.outside)").first();
      if (await any.count()) {
        await any.click();
        await settle(p, 600);
      }
    }
  });
  await capture("23-billing", "/billing");
  await capture("24-security", "/security");
  await capture("25-settings", "/settings");

  await browser.close();

  const shots = [
    ["01-login.png", "Login"],
    ["02-dashboard.png", "Dashboard"],
    ["03-workspaces.png", "Workspaces"],
    ["04-workspace-detail.png", "Workspace detail"],
    ["05-workspace-permissions.png", "Workspace permissions"],
    ["06-approvals.png", "Permission approval flows"],
    ["07-permission-realtime.png", "Permissions / approvals (realtime-backed UI)"],
    ["08-tasks.png", "Tasks"],
    ["09-task-detail.png", "Task detail"],
    ["10-issues.png", "Issues"],
    ["11-issue-detail.png", "Issue detail"],
    ["12-subtasks.png", "Subtasks"],
    ["13-assignments.png", "Assignments"],
    ["14-teams.png", "Teams"],
    ["15-team-detail.png", "Team detail"],
    ["16-projects.png", "Projects"],
    ["17-project-detail.png", "Project detail"],
    ["18-notifications.png", "Notifications"],
    ["19-activity.png", "Activity"],
    ["20-files.png", "Files"],
    ["21-timesheets.png", "Timesheets"],
    ["22-timesheet-day-panel.png", "Timesheet day panel (billing review)"],
    ["23-billing.png", "Billing (in development)"],
    ["24-security.png", "Security"],
    ["25-settings.png", "Settings"],
  ];

  const lines = [
    "# Screenshots",
    "",
    "Captured from the running app (Playwright) with demo data (`demo` / `demo1234`).",
    "",
    "```bash",
    "npm run start:backend",
    "npm run start:frontend",
    "npm run capture:screenshots",
    "# or: APP_URL=http://localhost:5175 CAPTURE_USER=demo CAPTURE_PASS=demo1234 npm run capture:screenshots",
    "```",
    "",
    "| File | Screen |",
    "| --- | --- |",
    ...shots.map(([f, label]) => `| \`${f}\` | ${label} |`),
    "",
  ];
  fs.writeFileSync(path.join(outDir, "README.md"), lines.join("\n"), "utf8");

  console.log(`\nScreenshots folder: ${outDir}`);
  console.log(`OK ${ok}/25` + (fail ? `  failed ${fail}` : ""));
  if (fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
