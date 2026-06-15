import { expect, test } from "@playwright/test";

// Smoke coverage against the live local stack: the panel loads, the backend is reachable (system
// info renders), and — when admin credentials are provided — login lands on the deployments page.
// Credentials come from the same env the stack is seeded with (WILLY_ADMIN_EMAIL/PASSWORD).

test("login screen renders and reaches the backend", async ({ page }) => {
  await page.goto("/login");

  // The sign-in button text flips from "Waiting for backend…" to "Sign in" once /system/info loads.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // The footer shows the Willy version once system info is fetched, proving the API is reachable.
  await expect(page.getByText(/Willy v/)).toBeVisible();
});

test("admin can sign in", async ({ page }) => {
  const email = process.env.WILLY_ADMIN_EMAIL;
  const password = process.env.WILLY_ADMIN_PASSWORD;

  test.skip(!email || !password, "set WILLY_ADMIN_EMAIL/PASSWORD to run the login flow");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email as string);
  await page.getByLabel("Password").fill(password as string);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/deployments/);
  await expect(page.getByRole("heading", { name: "Deployments" })).toBeVisible();
});
