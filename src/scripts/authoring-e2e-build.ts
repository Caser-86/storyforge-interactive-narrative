import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
const result = spawnSync(command, args, {
  env: { ...process.env, NEXT_DIST_DIR: ".next-playwright" },
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
