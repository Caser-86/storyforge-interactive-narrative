import { describe, it, expect } from "vitest";
import { checkInputSafety, checkArtPromptSafety, checkOutputSafety, getRatingPromptSuffix } from "@/lib/safety-service";

describe("checkInputSafety", () => {
  it("passes clean input", () => {
    const result = checkInputSafety("A brave hero explores a mysterious forest");
    expect(result.safe).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("flags self-harm content (Chinese)", () => {
    const result = checkInputSafety("主角想要自残来结束痛苦");
    expect(result.safe).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("flags suicide content (Chinese)", () => {
    const result = checkInputSafety("角色决定自杀");
    expect(result.safe).toBe(false);
  });

  it("flags child exploitation (Chinese)", () => {
    const result = checkInputSafety("未成年的性相关内容");
    expect(result.safe).toBe(false);
  });

  it("flags drug manufacturing (Chinese)", () => {
    const result = checkInputSafety("教人制造毒品的方法");
    expect(result.safe).toBe(false);
  });

  it("flags gun manufacturing (Chinese)", () => {
    const result = checkInputSafety("教人制造枪支的步骤");
    expect(result.safe).toBe(false);
  });

  it("rewrites copyright characters", () => {
    const result = checkInputSafety("Harry Potter appeared and cast a spell with his wand.");
    expect(result.rewritten).toBeTruthy();
    expect(result.rewritten).not.toContain("Harry Potter");
    expect(result.rewritten).toContain("original magical world");
  });

  it("rewrites Chinese copyright characters", () => {
    const result = checkInputSafety("哈利波特骑着扫帚飞过天空");
    expect(result.rewritten).toBeTruthy();
    expect(result.rewritten).not.toContain("哈利波特");
  });

  it("returns replacements array for copyright matches", () => {
    const result = checkInputSafety("Batman and Spider-Man team up");
    expect(result.replacements).toBeTruthy();
    expect(result.replacements!.length).toBeGreaterThan(0);
  });
});

describe("checkArtPromptSafety", () => {
  it("passes clean art prompt", () => {
    const result = checkArtPromptSafety("fantasy landscape with mountains and rivers, digital art style");
    expect(result.safe).toBe(true);
  });

  it("flags minor/child content", () => {
    const result = checkArtPromptSafety("a minor child walking alone in the dark forest");
    expect(result.safe).toBe(false);
    expect(result.warnings).toContain("artPrompt 包含未成年人相关不安全内容");
  });

  it("flags direct copy requests", () => {
    const result = checkArtPromptSafety("same as the Mona Lisa painting, identical to Starry Night");
    expect(result.safe).toBe(false);
    expect(result.warnings).toContain("artPrompt 包含直接仿冒提示");
  });

  it("rewrites real person descriptions", () => {
    const result = checkArtPromptSafety("portrait of a real person, photorealistic woman standing in rain");
    expect(result.rewritten).toBeTruthy();
    expect(result.rewritten).toContain("stylized character");
    expect(result.rewritten).not.toContain("real person");
  });

  it("rewrites trademark/brand references", () => {
    const result = checkArtPromptSafety("wearing a trademark Nike logo brand clothing");
    expect(result.rewritten).toBeTruthy();
    expect(result.rewritten).toContain("original design");
    expect(result.rewritten).not.toContain("trademark");
  });

  it("rewrites copyright characters in art prompt", () => {
    const result = checkArtPromptSafety("Batman standing on a rooftop, Spider-Man swinging between buildings");
    expect(result.rewritten).toBeTruthy();
    expect(result.rewritten).not.toContain("Batman");
  });
});

describe("checkOutputSafety", () => {
  it("passes clean output", () => {
    const result = checkOutputSafety({
      body: "The hero walked through the peaceful forest.",
    });
    expect(result.safe).toBe(true);
  });

  it("flags self-harm in output body (Chinese)", () => {
    const result = checkOutputSafety({
      body: "角色决定自残来逃避现实",
    });
    expect(result.safe).toBe(false);
  });

  it("flags copyright in NPC dialogue", () => {
    const result = checkOutputSafety({
      body: "The mysterious figure appeared.",
      npcs: [{ dialogue: "I am Harry Potter, the chosen one." }],
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("flags music style imitation", () => {
    const result = checkOutputSafety({
      musicPrompt: "sounds like Beethoven in the style of Mozart",
    });
    expect(result.warnings).toContain("BGM prompt 包含对特定艺术家的模仿，已移除");
  });
});

describe("getRatingPromptSuffix", () => {
  it("returns G rating constraint", () => {
    const suffix = getRatingPromptSuffix("G");
    expect(suffix).toContain("全年龄段");
  });

  it("returns PG rating constraint", () => {
    const suffix = getRatingPromptSuffix("PG");
    expect(suffix).toContain("青少年");
  });

  it("returns PG-13 rating constraint", () => {
    const suffix = getRatingPromptSuffix("PG-13");
    expect(suffix).toContain("13岁");
  });

  it("returns R rating constraint", () => {
    const suffix = getRatingPromptSuffix("R");
    expect(suffix).toContain("成人");
  });

  it("returns default for unknown rating", () => {
    const suffix = getRatingPromptSuffix("unknown");
    expect(suffix).toContain("默认");
  });
});
