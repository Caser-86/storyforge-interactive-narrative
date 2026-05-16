const UNSAFE_PATTERNS = [
  /未成年.*性/i,
  /child.*sex/i,
  /自残/i,
  /自杀/i,
  /教.*制.*毒/i,
  /教.*造.*枪/i,
];

const COPYRIGHT_PATTERNS = [
  /哈利波特/i,
  /Harry Potter/i,
  /漫威/i,
  /Marvel/i,
  /星球大战/i,
  /Star Wars/i,
  /任天堂/i,
  /Nintendo/i,
];

export interface SafetyCheckResult {
  safe: boolean;
  rewritten?: string;
  warnings: string[];
}

export function checkInputSafety(input: string): SafetyCheckResult {
  const warnings: string[] = [];
  let safe = true;
  let rewritten = input;

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(input)) {
      safe = false;
      warnings.push("输入包含不安全内容");
      break;
    }
  }

  for (const pattern of COPYRIGHT_PATTERNS) {
    if (pattern.test(input)) {
      warnings.push("输入包含受版权保护作品引用，将替换为原创设定");
      rewritten = rewritten.replace(pattern, "原创奇幻");
    }
  }

  return { safe, rewritten: rewritten !== input ? rewritten : undefined, warnings };
}

export function checkArtPromptSafety(prompt: string): SafetyCheckResult {
  const warnings: string[] = [];
  let safe = true;

  if (/minor|child|underage/i.test(prompt)) {
    safe = false;
    warnings.push("artPrompt 包含未成年人相关不安全内容");
  }

  if (/same as|identical to|copy of/i.test(prompt)) {
    warnings.push("artPrompt 包含直接仿冒提示");
    safe = false;
  }

  return { safe, warnings };
}
