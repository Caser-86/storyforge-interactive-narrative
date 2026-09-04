import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup-dom.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    pool: "forks",
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
