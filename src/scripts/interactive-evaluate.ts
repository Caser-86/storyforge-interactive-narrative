import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadAuthoringEnv } from "../lib/authoring/local-env";
import { OpenAICompatibleGenerationProvider } from "../lib/authoring/generation/openai-provider";
import { DEFAULT_OPENAI_MODEL } from "../lib/authoring/generation/defaults";
import {
  evaluateInteractiveFixture,
  InteractiveEvaluationFixtureSchema,
  type InteractiveEvaluationFixture,
} from "../lib/interactive/evaluation";

const root = path.resolve("src/fixtures/interactive/evaluations");

export type InteractiveEvaluationCliOptions = {
  provider: "fake" | "live";
  dryRun: boolean;
  allowNetwork: boolean;
  approvePaidCalls: boolean;
  fixtureId?: string;
};

function requiredValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

export function parseInteractiveEvaluationOptions(
  args: string[],
  fixtureIds: readonly string[] = [],
): InteractiveEvaluationCliOptions {
  let provider: InteractiveEvaluationCliOptions["provider"] = "fake";
  let dryRun = false;
  let allowNetwork = false;
  let approvePaidCalls = false;
  let fixtureId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--provider") {
      const value = requiredValue(args, index, argument);
      if (value !== "fake" && value !== "live") throw new Error("--provider must be fake or live.");
      provider = value;
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--allow-network") {
      allowNetwork = true;
    } else if (argument === "--approve-paid-calls") {
      approvePaidCalls = true;
    } else if (argument === "--fixture") {
      fixtureId = requiredValue(args, index, argument);
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  if (fixtureId && fixtureIds.length > 0 && !fixtureIds.includes(fixtureId)) {
    throw new Error(`Unknown interactive fixture: ${fixtureId}`);
  }
  if (provider === "fake" && (allowNetwork || approvePaidCalls)) {
    throw new Error("--allow-network and --approve-paid-calls are only valid with --provider live.");
  }
  if (provider === "live" && !dryRun) {
    if (!allowNetwork) throw new Error("Live evaluation requires --allow-network; otherwise use --dry-run.");
    if (!approvePaidCalls) throw new Error("Live evaluation requires --approve-paid-calls.");
    if (!fixtureId) throw new Error("Live evaluation requires one --fixture ID to bound paid calls.");
  }

  return { provider, dryRun, allowNetwork, approvePaidCalls, fixtureId };
}

function loadFixtures(): InteractiveEvaluationFixture[] {
  return fs.readdirSync(root)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => InteractiveEvaluationFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(root, file), "utf8"))));
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

function writeReport(filename: string, report: unknown): void {
  const outputDir = path.resolve("output/evaluations");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(report, null, 2) + "\n", "utf8");
}

async function main(): Promise<void> {
  loadAuthoringEnv();
  const fixtures = loadFixtures();
  const options = parseInteractiveEvaluationOptions(process.argv.slice(2), fixtures.map((fixture) => fixture.id));
  const selectedFixtures = options.fixtureId
    ? fixtures.filter((fixture) => fixture.id === options.fixtureId)
    : fixtures;

  if (options.provider === "live") {
    if (options.dryRun) {
      const report = {
        schema: "storyforge-interactive-evaluation-run@1",
        policyVersion: "interactive-evaluation@1",
        status: "dry-run",
        provider: options.provider,
        networkRequest: false,
        fixtureCount: selectedFixtures.length,
        targetTurns: selectedFixtures.map((fixture) => ({ id: fixture.id, targetTurns: fixture.targetTurns })),
      };
      writeReport("interactive-live-dry-run.json", report);
      console.log(JSON.stringify(report));
      return;
    }

    const fixture = selectedFixtures[0];
    if (!fixture) throw new Error("Selected interactive fixture was not found.");
    const result = await evaluateInteractiveFixture(fixture, new OpenAICompatibleGenerationProvider());
    const report = {
      schema: "storyforge-interactive-evaluation-run@1",
      policyVersion: "interactive-evaluation@1",
      status: result.passed ? "passed" : "failed",
      provider: options.provider,
      model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      networkRequest: true,
      fixtureCount: 1,
      passCount: result.passed ? 1 : 0,
      passRate: result.passed ? 1 : 0,
      results: [result],
    };
    writeReport(`interactive-live-${fixture.id}.json`, report);
    console.log(JSON.stringify(report, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  if (options.provider === "fake") {
    const results = [];
    for (const fixture of selectedFixtures) results.push(await evaluateInteractiveFixture(fixture));
    const passed = results.filter((result) => result.passed).length;
    const report = {
      schema: "storyforge-interactive-evaluation-run@1",
      policyVersion: "interactive-evaluation@1",
      provider: "fake",
      networkRequest: false,
      fixtureCount: selectedFixtures.length,
      passCount: passed,
      passRate: selectedFixtures.length === 0 ? 0 : passed / selectedFixtures.length,
      results,
    };
    writeReport("interactive-latest.json", report);
    console.log(JSON.stringify(report, null, 2));
    if (passed !== selectedFixtures.length) process.exitCode = 1;
    return;
  }

  throw new Error("--provider must be fake or live.");
}

if (isDirectRun()) main().catch((error) => { console.error(error instanceof Error ? error.message : "Interactive evaluation failed."); process.exitCode = 1; });
