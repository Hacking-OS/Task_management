import { Page, expect } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async login(identifier: string, password: string) {
    await this.goto();
    await this.page.getByPlaceholder("yourname or you@company.com").fill(identifier);
    await this.page.locator('input[type="password"]').fill(password);
    await this.page.locator("form.login-form button[type=\"submit\"]").click();
    await this.page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  }
}

export class AppShell {
  constructor(private readonly page: Page) {}

  async expectAuthenticated() {
    await expect(this.page).not.toHaveURL(/login/);
  }

  async gotoDashboard() {
    await this.page.goto("/dashboard");
    await this.page.waitForSelector(".stat-card, .page-header", { timeout: 15_000 });
  }

  async gotoProjects() {
    await this.page.goto("/projects");
    await this.page.waitForSelector(".resource-nav, .page-header", { timeout: 15_000 });
  }

  async gotoTeams() {
    await this.page.goto("/teams");
    await this.page.waitForSelector(".resource-nav, .page-header", { timeout: 15_000 });
  }

  async gotoSettings() {
    await this.page.goto("/settings");
    await this.page.waitForSelector(".page-header", { timeout: 15_000 });
  }
}
