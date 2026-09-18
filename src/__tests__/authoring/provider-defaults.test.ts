import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL } from "../../lib/authoring/generation/defaults";

const root = process.cwd();

describe("provider default configuration", () => {
  it("keeps runtime fallbacks aligned with the checked-in local configuration", () => {
    const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
    const startScript = fs.readFileSync(path.join(root, "scripts", "start-storyforge.ps1"), "utf8");
    const runtimeFiles = [
      ".github/workflows/ci.yml",
      "src/lib/authoring/generation/budget.ts",
      "src/lib/authoring/generation/fake-provider.ts",
      "src/lib/authoring/generation/openai-provider.ts",
      "src/lib/interactive/usage.ts",
      "src/scripts/authoring-llm-smoke.ts",
      "src/scripts/interactive-evaluate.ts",
    ];

    expect(envExample).toContain(`OPENAI_BASE_URL=${DEFAULT_OPENAI_BASE_URL}`);
    expect(envExample).toContain(`OPENAI_MODEL=${DEFAULT_OPENAI_MODEL}`);
    expect(compose).toContain(`OPENAI_BASE_URL=\${OPENAI_BASE_URL:-${DEFAULT_OPENAI_BASE_URL}}`);
    expect(compose).toContain(`OPENAI_MODEL=\${OPENAI_MODEL:-${DEFAULT_OPENAI_MODEL}}`);
    expect(startScript).toContain(`$env:OPENAI_BASE_URL = "${DEFAULT_OPENAI_BASE_URL}"`);
    expect(startScript).toContain(`$env:OPENAI_MODEL = "${DEFAULT_OPENAI_MODEL}"`);

    for (const file of runtimeFiles) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toContain("deepseek-v4-flash");
      expect(source, file).not.toContain("https://api.deepseek.com");
    }
  });
});
