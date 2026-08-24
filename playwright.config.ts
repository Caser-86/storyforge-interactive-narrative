import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The local E2E server uses a process-global memory DB, so parallel workers can race through shared state.
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3105",
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || undefined,
    headless: true,
  },
  webServer: {
    command: "node .next-playwright/standalone/server.js",
    port: 3105,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      DISABLE_REDIS: "true",
      IMAGE_PROVIDER: "mock",
      OPENAI_API_KEY: "sk-test-mock",
      GENERATION_PROVIDER: "fake",
      SQLITE_DB_PATH: path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite"),
      NEXT_DIST_DIR: ".next-playwright",
      PORT: "3105",
      HOSTNAME: "127.0.0.1",
    },
  },
});
