import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.APP_URL ?? "http://localhost:5174";
const OUT_DIR = path.resolve(process.cwd(), "screenshots");
const ACME_WORKSPACE_ID = "b8492b93-0939-4b38-b4c8-70b636f2990b";
const USERNAME = "demo";
const PASSWORD = "demo1234";

const PAGES = [
  { name: "01-login", path: "/login", auth: false },
  { name: "02-dashboard", path: "/dashboard", wait: "dashboard" },
  { name: "03-workspaces", path: "/workspaces", wait: "table" },
  { name: "04-workspace-detail", path: `/workspaces/${ACME_WORKSPACE_ID}`, wait: "stats" },
  { name: "05-workspace-permissions", path: `/workspaces/${ACME_WORKSPACE_ID}/permissions`, wait: "permissions" },
  { name: "06-tasks", path: "/tasks", wait: "table" },
  { name: "07-task-detail", path: null, wait: "detail" },
  { name: "08-issues", path: "/issues", wait: "table" },
  { name: "09-subtasks", path: "/subtasks", wait: "table" },
  { name: "10-assignments", path: "/assignments", wait: "table" },
  { name: "11-notifications", path: "/notifications", wait: "list" },
  { name: "12-activity", path: "/activity", wait: "timeline" },
  { name: "13-files", path: "/files", wait: "page" },
  { name: "14-timesheets", path: "/timesheets", wait: "table" },
  { name: "15-settings", path: "/settings", wait: "page" },
];

async function waitForApp(page) {
  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);

  await page.getByPlaceholder("yourname or you@company.com").fill(USERNAME);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form.login-form button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForSelector("text=Acme Software", { timeout: 20000 });
  await waitForApp(page);
}

async function waitForPageContent(page, waitType) {
  switch (waitType) {
    case "dashboard":
      await page.waitForFunction(() => {
        const values = Array.from(document.querySelectorAll(".stat-card strong")).map((el) => el.textContent?.trim());
        return values.some((v) => v && v !== "0" && v !== "0%");
      }, { timeout: 20000 }).catch(() => {});
      break;
    case "table":
      await page.waitForSelector(".data-table tbody tr", { timeout: 20000 }).catch(() => {});
      break;
    case "stats":
      await page.waitForSelector(".stat-card strong", { timeout: 20000 }).catch(() => {});
      break;
    case "permissions":
      await page.waitForSelector(".data-table tbody tr, .permission-matrix, .role-card", { timeout: 20000 }).catch(() => {});
      break;
    case "list":
      await page.waitForSelector(".mini-list li, .notification-list li, .data-table tbody tr", { timeout: 20000 }).catch(() => {});
      break;
    case "timeline":
      await page.waitForSelector(".activity-timeline li, .activity-list li, .timeline-item", { timeout: 20000 }).catch(() => {});
      break;
    case "detail":
      await page.waitForSelector(".detail-list, .card-title, h1", { timeout: 20000 }).catch(() => {});
      break;
    default:
      break;
  }
  await page.waitForTimeout(800);
}

async function resolveTaskDetailPath(page) {
  const taskId = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const res = await fetch("/api/tasks?workspace_id=b8492b93-0939-4b38-b4c8-70b636f2990b", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tasks?.[0]?.id ?? null;
  });
  return taskId ? `/tasks/${taskId}` : "/tasks";
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  let loggedIn = false;

  for (const item of PAGES) {
    try {
      if (item.auth === false) {
        await page.goto(`${BASE_URL}${item.path}`, { waitUntil: "domcontentloaded" });
      } else {
        if (!loggedIn) {
          await login(page);
          loggedIn = true;
        }

        let targetPath = item.path;
        if (item.name === "07-task-detail") {
          targetPath = await resolveTaskDetailPath(page);
        }

        await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: "domcontentloaded" });
      }

      await waitForApp(page);
      if (item.wait) await waitForPageContent(page, item.wait);

      const filePath = path.join(OUT_DIR, `${item.name}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`Saved ${filePath}`);
    } catch (error) {
      console.error(`Failed ${item.name}:`, error.message);
    }
  }

  await browser.close();
  console.log(`\nScreenshots folder: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
