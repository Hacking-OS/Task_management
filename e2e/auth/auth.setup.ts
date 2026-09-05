import { test as setup, expect } from "@playwright/test";
import { LoginPage } from "../pages/AppPages.js";

const DEMO_USER = process.env.E2E_USER ?? "demo";
const DEMO_PASS = process.env.E2E_PASS ?? "demo1234";

/** Requires demo seed: stop dev server → npm run reset-db → npm run dev */
setup("authenticate demo user", async ({ page }) => {
  await new LoginPage(page).login(DEMO_USER, DEMO_PASS);
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
