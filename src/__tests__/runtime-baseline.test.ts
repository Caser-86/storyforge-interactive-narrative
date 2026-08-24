import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime baseline", () => {
  it("uses Node 24 and npm as the only package manager", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.engines.node).toBe(">=24 <25");
    expect(fs.readFileSync(".node-version", "utf8").trim()).toBe("24");
    expect(fs.existsSync("pnpm-lock.yaml")).toBe(false);
    expect(fs.existsSync("pnpm-workspace.yaml")).toBe(false);
  });
});
