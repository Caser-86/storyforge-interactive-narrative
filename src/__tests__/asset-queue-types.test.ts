import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("installs one ioredis version", () => {
  const lockfile = JSON.parse(
    readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8")
  ) as {
    packages: {
      "": { dependencies?: Record<string, string> };
      "node_modules/bullmq"?: { dependencies?: Record<string, string> };
    };
  };
  const root = lockfile.packages[""].dependencies?.ioredis;
  const bull = lockfile.packages["node_modules/bullmq"]?.dependencies?.ioredis ?? root;

  expect(root).toBe("5.10.1");
  expect(bull).toBe(root);
});
