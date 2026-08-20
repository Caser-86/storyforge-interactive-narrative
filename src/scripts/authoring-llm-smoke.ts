const args = new Set(process.argv.slice(2));
const presetIndex = process.argv.indexOf("--preset");
const preset = presetIndex >= 0 ? process.argv[presetIndex + 1] : "micro";
const presets = {
  micro: { targetNodes: 8, targetEndings: 2 },
  short: { targetNodes: 24, targetEndings: 4 },
  medium: { targetNodes: 48, targetEndings: 6 },
} as const;

if (!(preset in presets)) {
  console.error(`Unknown preset: ${preset}`);
  process.exit(1);
}

const size = presets[preset as keyof typeof presets];
const stages = ["brief", "bible", "outline", "graph", "structural_check", "nodes", "continuity_review"];
const maxProviderCalls = size.targetNodes + 5;
const model = process.env.OPENAI_MODEL || "deepseek-v4-flash";
const baseURL = process.env.OPENAI_BASE_URL || "https://api.deepseek.com";

console.log("StoryForge authoring LLM smoke");
console.log(`preset: ${preset}`);
console.log(`stages: ${stages.join(" -> ")}`);
console.log(`target nodes: ${size.targetNodes}`);
console.log(`target endings: ${size.targetEndings}`);
console.log(`maximum provider calls: ${maxProviderCalls}`);
console.log(`model: ${model}`);
console.log(`base URL: ${baseURL}`);
console.log(`API key: ${process.env.OPENAI_API_KEY ? "configured (redacted)" : "not configured"}`);

if (args.has("--dry-run")) {
  console.log("dry-run: no database, provider client, or network request was created");
  process.exit(0);
}

console.error("Only --dry-run is supported by this safe smoke command.");
process.exit(1);
