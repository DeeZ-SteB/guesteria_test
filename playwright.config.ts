import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// Local secrets (Supabase keys) from .env; CI provides them as environment variables.
if (existsSync(".env")) process.loadEnvFile(".env");

const LIVE = process.env.E2E_LIVE === "1";
const APP_PORT = 8781;
const MOCK_PORT = 8782;
const MOCK_KEY = "e2e-mock-key-0000000000";
process.env.CHECKOUT_SECRET ??= randomBytes(32).toString("hex");

/**
 * Two tiers:
 * - default: LiteAPI is a local mock serving recorded sandbox responses (deterministic, CI, free);
 * - E2E_LIVE=1: the real LiteAPI sandbox (local only, creates one booking per run, cancelled).
 * The Anthropic API is never reachable: its base URL is a counting sink and the daily caps are 0.
 */
const appEnv: Record<string, string> = {
  E2E_MOCKS: "1",
  E2E_ANTHROPIC_SINK: `http://127.0.0.1:${MOCK_PORT}/anthropic`,
  ANTHROPIC_API_KEY: "e2e-dummy-key-not-real-000",
  ASSISTANT_DAILY_CAP: "0",
  ASSISTANT_ANON_DAILY_CAP: "0",
  CHECKOUT_SECRET: process.env.CHECKOUT_SECRET,
  ...(LIVE ? {} : { LITEAPI_KEY: MOCK_KEY, LITEAPI_MOCK_ORIGIN: `http://127.0.0.1:${MOCK_PORT}` }),
};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // shared database rows and rate limits
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-liteapi/server.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/__stats`,
      env: { MOCK_PORT: String(MOCK_PORT), LITEAPI_KEY: MOCK_KEY },
      reuseExistingServer: false,
    },
    {
      // A production build: the real CSP and headers are what the tests see.
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/api/health`,
      env: appEnv,
      timeout: 300_000,
      // Never reuse: a stray server would run an old build with the wrong environment.
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    ...(LIVE
      ? [{ name: "live", testMatch: /live\/.*\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 }, storageState: "e2e/.auth/user.json" } }]
      : [
          { name: "mobile", testIgnore: /live\//, testMatch: /\.(mobile|all)\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 }, storageState: "e2e/.auth/user.json" } },
          { name: "desktop", testIgnore: /live\//, testMatch: /\.(desktop|all)\.spec\.ts/, dependencies: ["setup"], use: { viewport: { width: 1280, height: 800 }, storageState: "e2e/.auth/user.json" } },
        ]),
  ],
});
