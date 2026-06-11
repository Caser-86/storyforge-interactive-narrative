const UNSAFE_PATTERNS = [
  /未成年.*性/i,
  /child.*sex/i,
  /自残/i,
  /自杀/i,
  /教.*制.*毒/i,
  /教.*造.*枪/i,
  /(?:如何|教|指导|教程).*(?:制造|制作|合成|获取).*(?:危险物品|爆炸物|炸弹|武器|枪支|毒品)/i,
  /(?:how\s+to|teach|guide|tutorial).*(?:make|build|manufacture|create|obtain).*(?:dangerous\s+item|explosive|bomb|weapon|gun|drug)/i,
];

const DEFAULT_COPYRIGHT_PATTERNS: [RegExp, string][] = [
  [/哈利波特/g, "原创魔法世界"],
  [/Harry Potter/gi, "original magical world"],
  [/漫威/g, "原创英雄宇宙"],
  [/Marvel/gi, "original hero universe"],
  [/星球大战/g, "原创太空史诗"],
  [/Star Wars/gi, "original space epic"],
  [/任天堂/g, "原创游戏世界"],
  [/Nintendo/gi, "original game world"],
  [/指环王/g, "原创奇幻史诗"],
  [/Lord of the Rings/gi, "original fantasy epic"],
  [/蝙蝠侠/g, "原创暗夜英雄"],
  [/Batman/gi, "original dark hero"],
  [/皮卡丘/g, "原创电气精灵"],
  [/Pikachu/gi, "original electric sprite"],
  [/塞尔达/g, "原创冒险传说"],
  [/Zelda/gi, "original adventure legend"],
];

const COPYRIGHT_REPLACEMENTS = loadCopyrightPatterns();

function loadCopyrightPatterns(): [RegExp, string][] {
  const envExtra = process.env.COPYRIGHT_PATTERNS;
  if (!envExtra) return DEFAULT_COPYRIGHT_PATTERNS;

  try {
    const extra: [RegExp, string][] = [];
    for (const entry of envExtra.split(";")) {
      const [pattern, replacement] = entry.split("=>");
      if (pattern && replacement) {
        extra.push([new RegExp(pattern.trim(), "gi"), replacement.trim()]);
      }
    }
    return [...DEFAULT_COPYRIGHT_PATTERNS, ...extra];
  } catch {
    return DEFAULT_COPYRIGHT_PATTERNS;
  }
}

export interface SafetyCheckResult {
  safe: boolean;
  rewritten?: string;
  warnings: string[];
  replacements?: Array<{ original: string; replacement: string }>;
}

export function checkInputSafety(input: string): SafetyCheckResult {
  const warnings: string[] = [];
  const replacements: Array<{ original: string; replacement: string }> = [];
  let safe = true;
  let rewritten = input;

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(input)) {
      safe = false;
      warnings.push("输入包含不安全内容");
      break;
    }
  }

  for (const [pattern, replacement] of COPYRIGHT_REPLACEMENTS) {
    const matches = input.match(pattern);
    if (matches) {
      for (const match of matches) {
        replacements.push({ original: match, replacement });
      }
      warnings.push(`输入包含受版权保护作品引用，已替换为原创设定`);
      rewritten = rewritten.replace(pattern, replacement);
    }
  }

  return {
    safe,
    rewritten: rewritten !== input ? rewritten : undefined,
    warnings,
    replacements: replacements.length > 0 ? replacements : undefined,
  };
}

export function checkArtPromptSafety(prompt: string): SafetyCheckResult {
  const warnings: string[] = [];
  const replacements: Array<{ original: string; replacement: string }> = [];
  let safe = true;
  let rewritten = prompt;

  if (/minor|child|underage/i.test(prompt)) {
    safe = false;
    warnings.push("artPrompt 包含未成年人相关不安全内容");
  }

  if (/same as|identical to|copy of/i.test(prompt)) {
    warnings.push("artPrompt 包含直接仿冒提示");
    safe = false;
  }

  if (/portrait of (a )?real person|photorealistic (man|woman|person)/i.test(prompt)) {
    warnings.push("artPrompt 包含真实人物描述，已移除");
    rewritten = rewritten.replace(/portrait of (a )?real person|photorealistic (man|woman|person)/gi, "stylized character");
  }

  if (/trademark|logo|brand/i.test(prompt)) {
    warnings.push("artPrompt 包含商标/品牌引用，已移除");
    rewritten = rewritten.replace(/trademark|logo|brand/gi, "original design");
  }

  for (const [pattern, replacement] of COPYRIGHT_REPLACEMENTS) {
    const matches = prompt.match(pattern);
    if (matches) {
      for (const match of matches) {
        replacements.push({ original: match, replacement });
      }
      rewritten = rewritten.replace(pattern, replacement);
    }
  }

  return {
    safe,
    rewritten: rewritten !== prompt ? rewritten : undefined,
    warnings,
    replacements: replacements.length > 0 ? replacements : undefined,
  };
}

export function checkOutputSafety(output: {
  body?: string;
  npcs?: Array<{ dialogue?: string; hiddenIntent?: string }>;
  artPrompt?: string;
  musicPrompt?: string;
}): SafetyCheckResult {
  const warnings: string[] = [];
  const replacements: Array<{ original: string; replacement: string }> = [];
  let safe = true;

  const allText = [
    output.body || "",
    ...(output.npcs?.map((n) => `${n.dialogue || ""} ${n.hiddenIntent || ""}`) || []),
    output.artPrompt || "",
    output.musicPrompt || "",
  ].join(" ");

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(allText)) {
      safe = false;
      warnings.push("输出内容包含不安全元素，需要重新生成");
      break;
    }
  }

  for (const [pattern, replacement] of COPYRIGHT_REPLACEMENTS) {
    const matches = allText.match(pattern);
    if (matches) {
      for (const match of matches) {
        replacements.push({ original: match, replacement });
      }
      warnings.push("输出包含受版权保护作品引用，已替换");
    }
  }

  if (output.musicPrompt && /像|sounds like|in the style of|style of/i.test(output.musicPrompt)) {
    const artistMatch = output.musicPrompt.match(/(?:像|sounds like|in the style of|style of)\s+(\S+)/i);
    if (artistMatch) {
      warnings.push("BGM prompt 包含对特定艺术家的模仿，已移除");
      replacements.push({ original: artistMatch[0], replacement: "original composition" });
    }
  }

  if (replacements.length > 0) {
    logCopyrightAudit("output_check", replacements);
  }

  return { safe, warnings, replacements: replacements.length > 0 ? replacements : undefined };
}

export function getRatingPromptSuffix(rating: string): string {
  switch (rating) {
    case "G":
      return "\n\n[内容约束] 此故事面向全年龄段。禁止任何暴力描写、恐怖元素、暗示性内容或复杂道德困境。语言简单友好。";
    case "PG":
      return "\n\n[内容约束] 此故事面向青少年。允许轻度冒险和温和冲突，禁止血腥暴力、恐怖场景或性暗示。";
    case "PG-13":
      return "\n\n[内容约束] 此故事面向13岁以上。允许适度紧张和冲突，但禁止详细暴力描写、露骨内容或极端恐怖。";
    case "R":
      return "\n\n[内容约束] 此故事面向成人。允许成熟主题和复杂道德困境，但禁止露骨性描写或极端暴力。注意：R级内容将限制公开分享功能。";
    default:
      return "\n\n[内容约束] 默认PG-13标准。";
  }
}

interface CopyrightAuditEntry {
  timestamp: string;
  source: string;
  original: string;
  replacement: string;
}

const copyrightAuditLog: CopyrightAuditEntry[] = [];

function logCopyrightAudit(source: string, replacements: Array<{ original: string; replacement: string }>) {
  const timestamp = new Date().toISOString();
  for (const r of replacements) {
    copyrightAuditLog.push({ timestamp, source, original: r.original, replacement: r.replacement });
    console.log(`[CopyrightAudit] source=${source} "${r.original}" → "${r.replacement}"`);
  }
  if (copyrightAuditLog.length > 500) {
    copyrightAuditLog.splice(0, copyrightAuditLog.length - 500);
  }
}

export function getCopyrightAuditLog(): CopyrightAuditEntry[] {
  return [...copyrightAuditLog];
}
