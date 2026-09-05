# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth\auth.setup.ts >> authenticate e2e user
- Location: e2e\auth\auth.setup.ts:3:6

# Error details

```
Error: expect(page).not.toHaveURL(expected) failed

Expected pattern: not /login/
Received string: "http://localhost:5173/login"
Timeout: 5000ms

Call log:
  - Expect "not toHaveURL" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "http://localhost:5173/login"

```

```yaml
- paragraph: Jellyfish Workspace
- heading "Welcome back" [level=1]
- paragraph: Create a workspace or join one you were invited to.
- button "Sign in"
- button "Register"
- text: Username or email
- textbox "Username or email":
  - /placeholder: yourname or you@company.com
- text: Password
- textbox "Password"
- button "Sign in"
- paragraph: "Demo account: demo / demo1234"
```

# Test source

```ts
  1  | import { test as setup, expect } from "@playwright/test";
  2  | 
  3  | setup("authenticate e2e user", async ({ page }) => {
  4  |   const id = `e2e${Date.now().toString(36)}`;
  5  |   const register = await page.request.post("/api/auth/register", {
  6  |     data: { username: id, email: `${id}@e2e.test`, password: "TestPass1" },
  7  |   });
  8  |   expect(register.ok()).toBeTruthy();
  9  | 
  10 |   await page.goto("/dashboard");
  11 |   await page.waitForSelector(".stat-card, .page-header", { timeout: 20_000 });
> 12 |   await expect(page).not.toHaveURL(/login/);
     |                          ^ Error: expect(page).not.toHaveURL(expected) failed
  13 | 
  14 |   await page.context().storageState({ path: "e2e/.auth/demo.json" });
  15 | });
  16 | 
```