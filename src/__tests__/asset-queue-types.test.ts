import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

type NpmDependencyTree = {
  version?: string;
  dependencies?: Record<string, NpmDependencyTree>;
};

type NpmInvocation = {
  command: string;
  args: string[];
};

function getNpmInvocation({
  npmExecPath,
  platform = process.platform,
}: {
  npmExecPath?: string | null;
  platform?: NodeJS.Platform;
} = {}): NpmInvocation {
  const resolvedNpmExecPath =
    npmExecPath === undefined ? process.env.npm_execpath : npmExecPath;

  if (resolvedNpmExecPath) {
    return {
      command: process.execPath,
      args: [resolvedNpmExecPath, "ls", "ioredis", "--json"],
    };
  }

  return {
    command: platform === "win32" ? "npm.cmd" : "npm",
    args: ["ls", "ioredis", "--json"],
  };
}

it("prefers npm_execpath when available", () => {
  expect(getNpmInvocation({ npmExecPath: "/tmp/npm-cli.js" })).toEqual({
    command: process.execPath,
    args: ["/tmp/npm-cli.js", "ls", "ioredis", "--json"],
  });
});

it("falls back to a platform npm launcher when npm_execpath is absent", () => {
  expect(getNpmInvocation({ npmExecPath: null, platform: "win32" })).toEqual({
    command: "npm.cmd",
    args: ["ls", "ioredis", "--json"],
  });

  expect(getNpmInvocation({ npmExecPath: null, platform: "linux" })).toEqual({
    command: "npm",
    args: ["ls", "ioredis", "--json"],
  });
});

it(
  "installs one ioredis version",
  { timeout: 15000 },
  () => {
    const { command, args } = getNpmInvocation();
    const dependencyTree = JSON.parse(
      execFileSync(command, args, {
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
