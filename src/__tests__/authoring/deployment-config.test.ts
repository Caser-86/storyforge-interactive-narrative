import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("local deployment boundary", () => {
  it("keeps the default Compose service on loopback and moves LAN access to an explicit override", () => {
    const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
    const lanOverride = fs.readFileSync(path.join(root, "docker-compose.lan.yml"), "utf8");

    expect(compose).toContain('"127.0.0.1:${APP_PORT:-3000}:3000"');
    expect(compose).not.toContain("STORYFORGE_ALLOW_LAN=true");
    expect(compose).toContain("STORYFORGE_HOST=127.0.0.1");
    expect(lanOverride).toContain('"${APP_PORT:-3000}:3000"');
    expect(lanOverride).toContain("STORYFORGE_ALLOW_LAN: \"true\"");
  });
});
