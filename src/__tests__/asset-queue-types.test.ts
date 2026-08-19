import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("installs one ioredis version", () => {
  const tree = JSON.parse(
    execFileSync("npm", ["ls", "ioredis", "--json"], {
      encoding: "utf8",
      shell: true,
    })
  );
  const root = tree.dependencies.ioredis.version;
  const bull = tree.dependencies.bullmq.dependencies?.ioredis?.version ?? root;

  expect(root).toBe("5.10.1");
  expect(bull).toBe(root);
});
