import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetAuthoringE2EDistDir } from "@/lib/authoring/e2e-build";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("authoring E2E build directory", () => {
  it("removes stale generated output before a standalone build", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-e2e-build-"));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, "dev", "types"), { recursive: true });
    fs.writeFileSync(path.join(directory, "dev", "types", "stale-route.ts"), "old route");

    resetAuthoringE2EDistDir(directory);

    expect(fs.existsSync(directory)).toBe(false);
  });
});
