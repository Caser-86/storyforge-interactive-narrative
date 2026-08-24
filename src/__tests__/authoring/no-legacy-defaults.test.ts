import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("authoring default boundary", () => {
  it("keeps the default page and authoring modules independent from the legacy game and asset path", () => {
    const defaultPage = fs.readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    const authoringSource = fs.readFileSync(path.join(root, "src/features/authoring/editor/editor-shell.tsx"), "utf8");

    expect(defaultPage).toContain("ProjectLibrary");
    expect(defaultPage).not.toMatch(/StartScreen|StoryPanel|VisualPanel|api\/games/);
    expect(authoringSource).not.toMatch(/asset-queue|asset-service|bullmq|ioredis|game store|api\/games/);
  });

  it("keeps health output focused on local authoring dependencies", () => {
    const healthSource = fs.readFileSync(path.join(root, "src/app/api/health/route.ts"), "utf8");

    expect(healthSource).not.toMatch(/asset-queue|imageProvider|ENABLE_IMAGE_GENERATION|REDIS_URL|redisRequired/);
    expect(healthSource).toContain("authoring");
  });
});
