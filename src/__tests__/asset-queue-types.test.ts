import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";

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

  if (platform === "win32") {
    return {
      command: process.execPath,
      args: [
        path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
        "ls",
        "ioredis",
        "--json",
      ],
    };
  }

  return { command: "npm", args: ["ls", "ioredis", "--json"] };
}

afterEach(() => {
  vi.resetModules();
});

it("prefers npm_execpath when available", () => {
  expect(getNpmInvocation({ npmExecPath: "/tmp/npm-cli.js" })).toEqual({
    command: process.execPath,
    args: ["/tmp/npm-cli.js", "ls", "ioredis", "--json"],
  });
});

it("uses a Node-executable npm CLI on Windows when npm_execpath is absent", () => {
  expect(getNpmInvocation({ npmExecPath: null, platform: "win32" })).toEqual({
    command: process.execPath,
    args: [
      path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
      "ls",
      "ioredis",
      "--json",
    ],
  });

  expect(getNpmInvocation({ npmExecPath: null, platform: "linux" })).toEqual({
    command: "npm",
    args: ["ls", "ioredis", "--json"],
  });
});

it("keeps the Windows npm CLI fallback executable without a shell", () => {
  const { command, args } = getNpmInvocation({ npmExecPath: null, platform: "win32" });

  expect(command).toBe(process.execPath);
  expect(fs.existsSync(args[0])).toBe(true);
});

it("rejects worker connection creation when the queue is disabled", async () => {
  const original = {
    DISABLE_REDIS: process.env.DISABLE_REDIS,
    ENABLE_IMAGE_GENERATION: process.env.ENABLE_IMAGE_GENERATION,
    REDIS_URL: process.env.REDIS_URL,
  };
  process.env.DISABLE_REDIS = "true";
  process.env.ENABLE_IMAGE_GENERATION = "false";
  delete process.env.REDIS_URL;

  try {
    const assetQueue = await import("@/lib/asset-queue") as typeof import("@/lib/asset-queue") & {
      getWorkerConnection: () => unknown;
    };

    expect(() => assetQueue.getWorkerConnection()).toThrow("Asset queue is not configured");
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

it("uses blocking-worker retry options only when the queue is configured", async () => {
  const original = {
    DISABLE_REDIS: process.env.DISABLE_REDIS,
    ENABLE_IMAGE_GENERATION: process.env.ENABLE_IMAGE_GENERATION,
    REDIS_URL: process.env.REDIS_URL,
  };
  process.env.DISABLE_REDIS = "false";
  process.env.ENABLE_IMAGE_GENERATION = "true";
  process.env.REDIS_URL = "redis://127.0.0.1:6379";

  try {
    const { getWorkerConnection } = await import("@/lib/asset-queue");

    expect(getWorkerConnection()).toMatchObject({
      url: "redis://127.0.0.1:6379",
      maxRetriesPerRequest: null,
    });
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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
