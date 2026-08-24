import fs from "node:fs";

export function resetAuthoringE2EDistDir(distDir: string): void {
  fs.rmSync(distDir, { recursive: true, force: true });
}
