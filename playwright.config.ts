import { defineConfig } from "@playwright/test";

// Runs against a local Supabase (CI: supabase start). See .github/workflows/ci.yml.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    storageState: "e2e/.auth.json",
    timezoneId: "America/New_York", // Ryan's time zone; the API uses it for repeats
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mac", use: { viewport: { width: 1440, height: 900 } } },
    { name: "iphone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: "python3 -m uvicorn api.index:app --port 8000",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
