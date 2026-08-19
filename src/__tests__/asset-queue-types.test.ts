import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

type NpmDependencyTree = {
  version?: string;
  dependencies?: Record<string, NpmDependencyTree>;
};

const npmCliPath = join(
  dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js"
);

it(
  "installs one ioredis version",
  { timeout: 15000 },
  () => {
    const dependencyTree = JSON.parse(
      execFileSync(process.execPath, [npmCliPath, "ls", "ioredis", "--json"], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        encoding: "utf8",
        windowsHide: true,
      })
    ) as NpmDependencyTree;

    const root = dependencyTree.dependencies?.ioredis?.version;
    const bull = dependencyTree.dependencies?.bullmq?.dependencies?.ioredis?.version;

    expect(root).toBe("5.10.1");
    expect(bull).toBe("5.10.1");
    expect(bull).toBe(root);
  }
);
