import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("exits before database or Redis setup when the asset queue is disabled", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/scripts/asset-worker.ts"],
    {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
      env: {
        ...process.env,
        DISABLE_REDIS: "true",
        ENABLE_IMAGE_GENERATION: "false",
        REDIS_URL: "",
        SQLITE_DB_PATH: ":memory:",
      },
    }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("[Worker] Asset worker is disabled; skipping startup.");
  expect(`${result.stdout}${result.stderr}`).not.toContain("Initializing database");
  expect(`${result.stdout}${result.stderr}`).not.toContain("Redis connection");
});
