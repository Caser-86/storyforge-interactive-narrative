import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build"], {
  env: { ...process.env, NEXT_DIST_DIR: ".next-playwright" },
  shell: true,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);

const distDir = path.resolve(".next-playwright");
const standaloneDir = path.join(distDir, "standalone");
const staticDir = path.join(distDir, "static");
fs.cpSync(staticDir, path.join(standaloneDir, ".next-playwright", "static"), { recursive: true, force: true });
fs.cpSync(staticDir, path.join(standaloneDir, ".next", "static"), { recursive: true, force: true });
if (fs.existsSync("public")) {
  fs.cpSync("public", path.join(standaloneDir, "public"), { recursive: true, force: true });
}
