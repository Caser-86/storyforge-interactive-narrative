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

  it("keeps the checked-in environment template and Docker defaults aligned", () => {
    const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
    const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

    expect(envExample).toContain("OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3");
    expect(envExample).toContain("OPENAI_MODEL=doubao-seed-evolving");
    expect(envExample).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(compose).toContain("OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://ark.cn-beijing.volces.com/api/plan/v3}");
    expect(compose).toContain("OPENAI_MODEL=${OPENAI_MODEL:-doubao-seed-evolving}");
    expect(gitignore).toContain("!.env.example");
  });
});
