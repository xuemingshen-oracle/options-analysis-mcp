import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "mobile.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      testMatch: "mobile.spec.ts",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
    {
      name: "mobile-chrome",
      testMatch: "mobile.spec.ts",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "../.venv/bin/python -m uvicorn options_analysis.web.app:app --host 127.0.0.1 --port 8010",
    url: "http://127.0.0.1:8010/api/v1/info",
    reuseExistingServer: false,
    env: {
      OPTIONS_ANALYSIS_ENVIRONMENT: "test",
      OPTIONS_ANALYSIS_ENABLED_PROVIDERS: '["fake"]',
      OPTIONS_ANALYSIS_DEFAULT_MARKET_DATA_PROVIDER: "fake",
      OPTIONS_ANALYSIS_ALLOW_LIVE_SMOKE_TESTS: "false",
      OPTIONS_ANALYSIS_STATE_DB_PATH: join(
        tmpdir(),
        `option-atlas-e2e-${process.pid}.sqlite3`,
      ),
    },
  },
});
