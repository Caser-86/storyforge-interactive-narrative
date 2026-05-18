import type { NarrativeOutput, Choice } from "./schemas";

export interface QualityCheckResult {
  passed: boolean;
  issues: string[];
  shouldRetry: boolean;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
    }
  }
  return dp[m][n];
}

function choiceSimilarity(a: Choice, b: Choice): number {
  const labelDist = levenshteinDistance(a.label, b.label);
  const intentDist = levenshteinDistance(a.intent, b.intent);
  const maxLen = Math.max(a.label.length + a.intent.length, b.label.length + b.intent.length, 1);
  return 1 - (labelDist + intentDist) / maxLen;
}

export function checkChoiceSimilarity(choices: Choice[]): QualityCheckResult {
  const issues: string[] = [];
  const SIMILARITY_THRESHOLD = 0.7;

  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      const sim = choiceSimilarity(choices[i], choices[j]);
      if (sim > SIMILARITY_THRESHOLD) {
        issues.push(`选项 "${choices[i].label}" 和 "${choices[j].label}" 过于相似 (${(sim * 100).toFixed(0)}%)`);
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: issues.length > 0,
  };
}

export function checkRiskCoverage(choices: Choice[]): QualityCheckResult {
  const risks = new Set(choices.map((c) => c.risk));
  const missing: string[] = [];

  if (!risks.has("low")) missing.push("low");
  if (!risks.has("medium")) missing.push("medium");
  if (!risks.has("high")) missing.push("high");

  const issues = missing.map((r) => `缺少 ${r} 风险选项`);

  return {
    passed: missing.length === 0,
    issues,
    shouldRetry: missing.length >= 2,
  };
}

export function checkThreadReference(narrative: NarrativeOutput, knownThreads: string[]): QualityCheckResult {
  const issues: string[] = [];
  const body = narrative.scene.body.toLowerCase();

  const referenced = knownThreads.filter((t) => body.includes(t.toLowerCase()));
  if (knownThreads.length > 0 && referenced.length === 0) {
    issues.push("叙事未引用任何已知伏笔/线索");
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: false,
  };
}

const MAX_NPCS_PER_SCENE = 3;

export function checkNpcCount(narrative: NarrativeOutput): QualityCheckResult {
  const issues: string[] = [];
  const npcCount = narrative.scene.npcs.length;

  if (npcCount > MAX_NPCS_PER_SCENE) {
    issues.push(`NPC 数量 ${npcCount} 超过上限 ${MAX_NPCS_PER_SCENE}`);
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: npcCount > MAX_NPCS_PER_SCENE + 1,
  };
}

export function checkChapterProgression(turn: number, narrative: NarrativeOutput): QualityCheckResult {
  const issues: string[] = [];

  if (turn >= 7 && !narrative.scene.chapterGoal?.includes("结局") && !narrative.scene.chapterGoal?.includes("ending")) {
    issues.push(`turn=${turn} >= 7，建议引入结局走向`);
  }

  if (turn >= 3 && turn % 3 === 0) {
    const hasProgress = narrative.scene.body.length > 200 && narrative.scene.chapterGoal;
    if (!hasProgress) {
      issues.push(`turn=${turn} 应推进主线剧情`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: false,
  };
}

export function checkArtPromptQuality(narrative: NarrativeOutput): QualityCheckResult {
  const issues: string[] = [];
  const artPrompt = narrative.scene.artPrompt.prompt.toLowerCase();

  const hasLocation = /room|hall|forest|city|street|castle|village|space|ship|cave|temple|garden|tower|bridge|market|dungeon|office|lab/i.test(artPrompt);
  const hasSubject = /person|figure|character|man|woman|creature|robot|dragon|knight|wizard|detective|soldier/i.test(artPrompt);
  const hasLighting = /light|shadow|glow|dark|bright|sunset|sunrise|moon|candle|neon|fire|lamp|dawn|dusk/i.test(artPrompt);
  const hasStyle = /style|painting|render|art|illustration|cinematic|anime|realistic|watercolor|pixel|noir/i.test(artPrompt);

  if (!hasLocation) issues.push("artPrompt 缺少地点描述");
  if (!hasSubject) issues.push("artPrompt 缺少主体描述");
  if (!hasLighting) issues.push("artPrompt 缺少光照描述");
  if (!hasStyle) issues.push("artPrompt 缺少风格描述");

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: false,
  };
}

export function checkBgmMoodMatch(narrative: NarrativeOutput): QualityCheckResult {
  const issues: string[] = [];
  const moods = narrative.scene.mood.map((m) => m.toLowerCase());
  const bgmMood = narrative.scene.bgmCue.mood.toLowerCase();

  if (moods.length > 0 && bgmMood) {
    const moodKeywords: Record<string, string[]> = {
      "紧张": ["tense", "suspense", "thriller", "urgent", "dramatic"],
      "神秘": ["mysterious", "enigmatic", "ethereal", "ambient", "dark"],
      "恐怖": ["horror", "creepy", "dark", "ominous", "eerie"],
      "欢快": ["cheerful", "upbeat", "joyful", "bright", "lively"],
      "悲伤": ["sad", "melancholy", "somber", "mournful", "grief"],
      "浪漫": ["romantic", "tender", "soft", "warm", "intimate"],
    };

    const hasMatch = moods.some((m) => {
      const keywords = moodKeywords[m] || [];
      return keywords.some((k) => bgmMood.includes(k)) || bgmMood.includes(m);
    });

    if (!hasMatch && moods.length > 0) {
      issues.push(`bgmCue.mood "${bgmMood}" 与场景情绪 ${moods.join("/")} 不匹配`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: false,
  };
}

export function checkNpcDialogueQuality(narrative: NarrativeOutput): QualityCheckResult {
  const issues: string[] = [];

  for (const npc of narrative.scene.npcs) {
    if (npc.dialogue.length > 200) {
      issues.push(`NPC "${npc.name}" 对话过长 (${npc.dialogue.length} 字)`);
    }
    if (npc.dialogue.length < 5) {
      issues.push(`NPC "${npc.name}" 对话过短，缺乏角色表达`);
    }
    if (!npc.hiddenIntent || npc.hiddenIntent.length < 3) {
      issues.push(`NPC "${npc.name}" 缺少隐藏意图`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: false,
  };
}

export function checkChoiceProgression(narrative: NarrativeOutput): QualityCheckResult {
  const issues: string[] = [];
  const choices = narrative.scene.choices;

  const _allAdvance = choices.every((c) =>
    /前进|探索|攻击|逃跑|对话|调查|使用|打开|接受|拒绝|帮助|阻止/i.test(c.intent)
  );

  const noneAdvance = choices.every((c) =>
    /等待|观察|犹豫|思考|停留/i.test(c.intent) && !/前进|探索|行动/i.test(c.intent)
  );

  if (noneAdvance && choices.length > 0) {
    issues.push("所有选项都不推进剧情，只是被动等待");
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: issues.length > 0,
  };
}

export function checkStateEffectsDifference(choices: Choice[]): QualityCheckResult {
  const issues: string[] = [];

  if (choices.length < 2) {
    return { passed: true, issues: [], shouldRetry: false };
  }

  for (let i = 0; i < choices.length; i++) {
    const effects = choices[i].stateEffects;
    const keys = Object.keys(effects);
    if (keys.length === 0) {
      issues.push(`选项 "${choices[i].label}" 的 stateEffects 为空，必须至少改变 1 个状态变量`);
    }
  }

  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      const keysA = Object.keys(choices[i].stateEffects);
      const keysB = Object.keys(choices[j].stateEffects);
      const uniqueToA = keysA.filter((k) => !keysB.includes(k));
      const uniqueToB = keysB.filter((k) => !keysA.includes(k));
      if (uniqueToA.length === 0 && uniqueToB.length === 0 && keysA.length > 0) {
        issues.push(`选项 "${choices[i].label}" 和 "${choices[j].label}" 的 stateEffects 完全相同`);
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    shouldRetry: issues.some((i) => i.includes("完全相同")),
  };
}

export function runAllQualityChecks(
  narrative: NarrativeOutput,
  knownThreads: string[] = [],
  turn: number = 1
): QualityCheckResult {
  const allIssues: string[] = [];
  let shouldRetry = false;

  const checks = [
    checkChoiceSimilarity(narrative.scene.choices),
    checkRiskCoverage(narrative.scene.choices),
    checkStateEffectsDifference(narrative.scene.choices),
    checkThreadReference(narrative, knownThreads),
    checkNpcCount(narrative),
    checkChapterProgression(turn, narrative),
    checkArtPromptQuality(narrative),
    checkBgmMoodMatch(narrative),
    checkNpcDialogueQuality(narrative),
    checkChoiceProgression(narrative),
  ];

  for (const check of checks) {
    allIssues.push(...check.issues);
    if (check.shouldRetry) shouldRetry = true;
  }

  return {
    passed: allIssues.length === 0,
    issues: allIssues,
    shouldRetry,
  };
}
