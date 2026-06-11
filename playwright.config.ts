import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The local E2E server uses a process-global memory DB, so parallel workers can race through shared state.
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3105",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --port 3105",
    port: 3105,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      DISABLE_REDIS: "true",
      IMAGE_PROVIDER: "mock",
      OPENAI_API_KEY: "sk-test-mock",
      USE_MEMORY_DB: "true",
    },
  },
});
