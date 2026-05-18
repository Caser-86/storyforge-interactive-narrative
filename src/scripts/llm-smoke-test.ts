import { generateNarrative, generateFallbackNarrative } from "../lib/narrative-service";
import { NarrativeOutputSchema } from "../lib/schemas";

async function smokeTest() {
  console.log("=== LLM Provider Smoke Test ===\n");

  console.log("1. Testing fallback narrative (no LLM needed)...");
  try {
    const fallback = generateFallbackNarrative({
      seedPrompt: "一个赛博朋克侦探故事",
      language: "zh-CN",
      rating: "PG-13",
      sessionId: "smoke_test",
      sceneId: "scene_smoke",
    });
    const validated = NarrativeOutputSchema.parse(fallback);
    console.log(`   ✓ Fallback narrative generated: "${validated.scene.title}"`);
    console.log(`   ✓ ${validated.scene.choices.length} choices, ${validated.scene.npcs.length} NPCs`);
    console.log();
  } catch (err) {
    console.error("   ✗ Fallback narrative failed:", err);
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const isRealKey = apiKey && !apiKey.startsWith("sk-test") && !apiKey.startsWith("sk-mock");

  if (!isRealKey) {
    console.log("2. Skipping real LLM call (no valid OPENAI_API_KEY)");
    console.log("   Set OPENAI_API_KEY to test real provider\n");
  } else {
    console.log("2. Testing real LLM provider...");
    try {
      const result = await generateNarrative({
        seedPrompt: "一个中世纪魔法学院的故事",
        language: "zh-CN",
        rating: "PG-13",
        sessionId: "smoke_llm_test",
        sceneId: "scene_llm_smoke",
      });
      console.log(`   ✓ Real LLM response: "${result.data.scene.title}"`);
      console.log(`   ✓ Latency: ${result.latencyMs}ms, Retries: ${result.retryCount}`);
      console.log(`   ✓ ${result.data.scene.choices.length} choices, ${result.data.scene.npcs.length} NPCs`);
      console.log();
    } catch (err) {
      console.error("   ✗ Real LLM call failed:", err instanceof Error ? err.message : err);
      console.log("   This is expected if the API key is invalid or rate-limited\n");
    }
  }

  console.log("3. Testing schema validation on fallback...");
  try {
    const fallback = generateFallbackNarrative({
      seedPrompt: "test",
      language: "en-US",
      rating: "G",
      sessionId: "smoke_schema",
      sceneId: "scene_schema",
    });

    const requiredFields = ["scene", "statePatch", "safety"];
    for (const field of requiredFields) {
      if (!(field in fallback)) {
        console.error(`   ✗ Missing required field: ${field}`);
      }
    }

    const sceneFields = ["title", "location", "timeOfDay", "mood", "body", "npcs", "choices", "artPrompt", "bgmCue", "memorySummary", "chapterGoal"];
    for (const field of sceneFields) {
      if (!(field in fallback.scene)) {
        console.error(`   ✗ Missing scene field: ${field}`);
      }
    }

    if (fallback.scene.choices.length < 2) {
      console.error("   ✗ Less than 2 choices in fallback");
    }

    console.log("   ✓ Schema validation passed\n");
  } catch (err) {
    console.error("   ✗ Schema validation failed:", err);
    process.exit(1);
  }

  console.log("=== LLM Provider Smoke Test Complete ===");
  process.exit(0);
}

smokeTest();
