import { describe, expect, it } from "vitest";
import { FakeInteractiveGenerationProvider } from "@/lib/interactive/fake-provider";
import { InteractiveGenerationOutputSchema } from "@/lib/interactive/generator";

describe("fake interactive provider", () => {
  it("returns an ending at the configured final turn", async () => {
    const provider = new FakeInteractiveGenerationProvider();
    const result = await provider.generate({
      stage: "nodes",
      stepKey: "interactive:turn:8",
      systemPrompt: "test",
      userPrompt: "Story progress: turn 8/8.",
      outputSchema: InteractiveGenerationOutputSchema,
    });

    expect(result.data.scene.isEnding).toBe(true);
    expect(result.data.scene.choices).toHaveLength(0);
  });
});
