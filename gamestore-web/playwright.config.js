import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./output/playwright/results",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
