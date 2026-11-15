import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/live",
  globalSetup: "./tests/live/setup.js",
  outputDir: "./output/playwright-live/results",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5180",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5180",
    url: "http://127.0.0.1:5180",
    env: { VITE_API_BASE_URL: "http://127.0.0.1:18080/api" },
    // Optional explicit local server for WSL environments with slow closed-port probes.
    reuseExistingServer: process.env.COMMERCE_LIVE_REUSE_SERVER === "1",
  },
});
