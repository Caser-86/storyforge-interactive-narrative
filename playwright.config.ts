import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      DISABLE_REDIS: "true",
      IMAGE_PROVIDER: "mock",
      OPENAI_API_KEY: "sk-test-mock",
    },
  },
});
