import { defineConfig, devices } from "@playwright/test";

// E2E runs against the live local stack (`make dev` → https://willy.localhost). The stack uses a
// mkcert cert that CI won't trust, so HTTPS errors are ignored. Override the target with
// E2E_BASE_URL when pointing at a different environment.
const baseURL = process.env.E2E_BASE_URL ?? "https://willy.localhost";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
