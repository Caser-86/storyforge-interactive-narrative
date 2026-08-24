import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildFakeEvaluationCandidate, evaluateCandidate, EvaluationFixtureSchema } from "../lib/authoring/generation/evaluation";
import { loadAuthoringEnv } from "../lib/authoring/local-env";
import type { EvaluationFixture } from "../lib/authoring/generation/evaluation";

const root = path.resolve("src/fixtures/authoring/evaluations");

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadFixtures(): EvaluationFixture[] {
  return fs.readdirSync(root).filter((file) => file.endsWith(".json")).sort().map((file) => EvaluationFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(root, file), "utf8"))));
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

async function main(): Promise<void> {
  loadAuthoringEnv();
  const provider = argumentValue("--provider") ?? "fake";
  const dryRun = process.argv.includes("--dry-run");
  const fixtures = loadFixtures();
  const maxOutputTokens = Number(argumentValue("--max-output-tokens") ?? 32_000);
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 1_000_000) throw new Error("--max-output-tokens must be an integer from 1 to 1000000.");
  if (provider === "live") {
    if (!dryRun) throw new Error("Live evaluation is dry-run only until an explicit paid-call approval workflow is added.");
    console.log(JSON.stringify({ schema: "storyforge-evaluation-run@1", status: "dry-run", provider, networkRequest: false, fixtureCount: fixtures.length, plannedMaxOutputTokens: maxOutputTokens }));
    return;
  }
  if (provider !== "fake") throw new Error("--provider must be fake or live.");
  const results = fixtures.map((fixture) => evaluateCandidate(fixture, buildFakeEvaluationCandidate(fixture)));
  const passed = results.filter((result) => result.passed).length;
  const report = {
    schema: "storyforge-evaluation-run@1",
    policyVersion: "generation-evaluation@1",
    provider: "fake",
    networkRequest: false,
    fixtureCount: fixtures.length,
    passCount: passed,
    passRate: fixtures.length === 0 ? 0 : passed / fixtures.length,
    results,
  };
  const outputDir = path.resolve("output/evaluations");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "latest.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (passed !== fixtures.length) process.exitCode = 1;
}

if (isDirectRun()) main().catch((error) => { console.error(error instanceof Error ? error.message : "Evaluation failed."); process.exitCode = 1; });
