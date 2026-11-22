import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_BASE_URL points the suite at a server that is already running
// (for example `next dev -p 3210`); without it Playwright starts its own.
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = externalBaseUrl || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: process.env.CI ? "npm run start" : "npm run dev",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
