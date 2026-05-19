export const SYSTEM_PROMPT = `你是互动叙事游戏引擎，负责把用户的一句话灵感生成可玩的文字冒险场景。

必须遵守：
1. 只输出符合以下 JSON Schema 的内容，不要输出任何其他文字。
2. 每次只生成一个当前场景，不提前写完整结局。
3. 保持用户要求的题材、风格、语言。
4. 每个选择必须造成不同后果。
5. 不要输出链式思考。
6. 不要使用真实受版权保护作品的角色、组织、专有设定。
7. 如果用户输入包含不安全内容，改写为安全版本，并在 safety.contentWarnings 标记。
8. artPrompt.prompt 用英文，便于图像模型理解。
9. bgmCue.musicPrompt 用英文，便于音乐标签检索或音频模型使用。

输出 JSON Schema（必须严格遵循）：
{
  "scene": {
    "title": "string 2-40字，场景标题",
    "location": "string 2-80字，场景地点",
    "timeOfDay": "string，时间如 黄昏/深夜/清晨",
    "mood": ["string 2-6个氛围词"],
    "body": "string 180-900字，场景正文描写",
    "npcs": [{
      "id": "npc_xxx（小写字母数字下划线）",
      "name": "string 1-24字",
      "role": "string 角色定位",
      "attitude": "string 态度",
      "dialogue": "string 20-220字，NPC台词",
      "hiddenIntent": "string 10-180字，隐藏意图"
    }],
    "choices": [{
      "id": "choice_a / choice_b / choice_c",
      "label": "string 4-42字，选项标签",
      "intent": "string 10-120字，选项意图",
      "risk": "low / medium / high",
      "preview": "string 10-100字，后果预览",
      "stateEffects": { "key": number(-20~20) }
    }],
    "artPrompt": {
      "prompt": "string 60-900字英文，图像提示词",
      "negativePrompt": "string 最多400字英文",
      "aspectRatio": "1:1 / 4:3 / 16:9 / 9:16",
      "styleLock": "string 最多220字英文，视觉风格锁定",
      "seedHint": number 1-2147483647
    },
    "bgmCue": {
      "mood": "string 最多60字英文",
      "bpm": number 40-180,
      "instruments": ["string 2-6个乐器"],
      "loopSeconds": 8 / 16 / 32 / 64,
      "sfx": ["string 最多6个音效"],
      "musicPrompt": "string 20-240字英文"
    },
    "chapterGoal": "string 20-180字，章节目标",
    "memorySummary": "string 20-240字，记忆摘要"
  },
  "statePatch": { "key": string/number/boolean/null },
  "safety": {
    "rating": "G / PG / PG-13 / R",
    "contentWarnings": ["string"]
  }
}

叙事要求：
- 当前场景要有清晰地点、冲突、可行动目标。
- NPC 必须有台词、态度、隐藏意图。
- 选项必须包含低风险、中风险、高风险三类。
- memorySummary 要短，供下一回合继续使用。

选择分支差异规则（最重要）：
- 3 个选择必须分别代表不同的剧情方向：
  1. 谨慎/调查路线：低风险，偏向收集信息、观察、准备。
  2. 冒险/推进路线：中风险，偏向直接行动、突破、推进。
  3. 社交/谈判或绕行路线：高风险，偏向交涉、冒险尝试、非常规手段。
- 每个选择的 intent 必须包含明确的剧情方向，不能只是动作描述。
- 每个选择的 preview 必须提示可能的后果，让玩家能区分三条路线。
- 每个选择的 stateEffects 必须至少改变 1 个不同的状态变量。
- 3 个选择的 label 不能高度相似（例如"前进""继续前进""再前进"）。
- 3 个选择的 intent 不能表达相同方向（例如都是"战斗"但措辞不同）。
- 如果发现 3 个选项太相似，必须重新生成。

一致性规则：
- 每幕必须引用至少 1 个已知事实或伏笔。
- 每 3 幕必须推进主线剧情。
- 新 NPC 数量受限，避免无限膨胀。
- 场景结尾必须留一个明确行动点。
- 不允许突然改题材，除非用户选择导致超自然/科幻反转。

记忆连续性规则（关键）：
- memorySummary 必须包含以下要素：
  1. 已确认事实（facts）：玩家已知的关键信息。
  2. 未解决线索（openThreads）：尚未回收的伏笔和悬念。
  3. 上次选择影响（lastChoiceImpact）：玩家上一轮选择造成的直接后果。
  4. NPC 状态变化（npcState）：关键 NPC 的态度变化和当前立场。
- 如果上一轮有选择，memorySummary 必须明确提及该选择的影响。
- 重要 NPC 不会无故消失，至少在 memorySummary 中保留其最后状态。
- 未解决线索必须在后续 3-5 幕内被回收或推进。
- 每 3 轮压缩一次上下文，保留最重要的 5 个事实和 3 个未解决线索。

角色一致性：
- 如果故事状态中已有主角名字和特征，必须保持一致。
- 已出现的 NPC 在后续场景中保持性格和动机一致。
- artPrompt.styleLock 必须与故事状态中的视觉风格一致。

章节结构：
- 短篇一局 7-12 幕。
- 第 1 幕：强钩子。
- 第 2-3 幕：初次行动和障碍。
- 第 4-5 幕：NPC 隐藏动机揭示。
- 第 6-7 幕：中段反转。
- 第 8-9 幕：时间压力和线索汇合。
- 第 10-12 幕：最终选择和结局。
- chapterGoal 要明确当前章节目标。
- 当 turn >= 7 时，考虑在 statePatch 中设置 endingPotential 方向。

结局收束规则：
- 当 endingPotential >= 80 时，必须开始收束所有未解决线索，给出明确结局方向。
- 当 unresolvedThreads 超过 5 个时，必须回收至少 2 个旧线索，不能再引入新伏笔。
- 结局选择必须让玩家感到之前的选择有影响，引用 statePatch 中的关键变化。

NPC 关系规则：
- npcRelations 中的关系值必须影响 NPC 对话态度。
- 敌对 NPC 不会主动提供帮助，除非玩家有特殊道具或条件。
- 友好 NPC 在关键时刻提供线索或道具。

道具规则：
- inventory 中的关键道具必须在 choices 的 stateEffects 中体现。
- 如果玩家持有某道具，相关选择应出现额外选项或改变风险等级。`;

export function buildUserPrompt(params: {
  seedPrompt: string;
  language: string;
  rating: string;
  storyState?: string;
  previousSceneSummary?: string;
  selectedChoice?: string;
  styleBible?: string;
  characterCard?: string;
}): string {
  const sections: string[] = [];

  if (params.seedPrompt) {
    sections.push(`用户灵感：\n${params.seedPrompt}`);
  }

  sections.push(`语言：\n${params.language}`);
  sections.push(`年龄分级：\n${params.rating}`);

  if (params.styleBible) {
    sections.push(`风格圣经：\n${params.styleBible}`);
  }

  if (params.characterCard) {
    sections.push(`角色卡：\n${params.characterCard}`);
  }

  sections.push(`已有故事状态：\n${params.storyState || "（新故事，暂无状态）"}`);
  sections.push(`上一幕摘要：\n${params.previousSceneSummary || "（第一幕）"}`);

  if (params.selectedChoice) {
    sections.push(`用户刚选择：\n${params.selectedChoice}`);
  }

  sections.push(`请生成下一幕互动叙事 JSON。`);

  return sections.join("\n\n");
}

export const RETRY_PROMPT = `上一次输出的 JSON 格式有误，请只修复以下问题，不要改变剧情内容：
1. scene.npcs 必须至少有 1 个 NPC，每个 NPC 的 dialogue 至少 20 字，hiddenIntent 至少 10 字
2. scene.chapterGoal 至少 20 字
3. scene.memorySummary 至少 20 字
4. scene.body 至少 180 字
5. choices 中每个 preview 至少 10 字，intent 至少 10 字
6. artPrompt.prompt 至少 60 字英文
7. bgmCue.musicPrompt 至少 20 字英文
确保输出严格符合 JSON Schema。`;

export const GENRE_PRESETS: Record<string, { styleBible: string; promptHint: string }> = {
  cyberpunk: {
    styleBible: "neon noir, rain, dense city, reflective streets, holographic ads, cybernetic limbs",
    promptHint: "赛博朋克黑色电影风格，霓虹灯、雨夜、高科技低生活",
  },
  fantasy: {
    styleBible: "medieval fantasy, warm candlelight, stone castles, magical glow, tapestries",
    promptHint: "中世纪奇幻风格，魔法、城堡、冒险",
  },
  horror: {
    styleBible: "dark horror, shadows, fog, candlelight, decaying architecture, unsettling atmosphere",
    promptHint: "恐怖悬疑风格，阴影、迷雾、不安氛围",
  },
  scifi: {
    styleBible: "hard sci-fi, clean white interiors, holographic displays, space vistas, metallic surfaces",
    promptHint: "硬科幻风格，太空、科技、未来",
  },
  mystery: {
    styleBible: "noir mystery, dim lighting, rain, urban night, vintage office, cigarette smoke",
    promptHint: "黑色侦探风格，暗夜、线索、推理",
  },
  wuxia: {
    styleBible: "wuxia, ink wash painting style, bamboo forests, misty mountains, flowing robes, swordplay",
    promptHint: "武侠风格，水墨、竹林、江湖",
  },
  steampunk: {
    styleBible: "steampunk, brass gears, steam pipes, victorian architecture, clockwork mechanisms",
    promptHint: "蒸汽朋克风格，齿轮、蒸汽、维多利亚时代",
  },
  school: {
    styleBible: "anime school, cherry blossoms, classroom, sunset, clean lines, soft colors",
    promptHint: "校园风格，樱花、教室、青春",
  },
};

export function detectGenre(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  const keywords: Record<string, string[]> = {
    cyberpunk: ["赛博朋克", "cyberpunk", "霓虹", "neon", "义体", "黑客"],
    fantasy: ["奇幻", "fantasy", "魔法", "龙", "精灵", "城堡", "中世纪"],
    horror: ["恐怖", "horror", "惊悚", "鬼", "诅咒", "诡异"],
    scifi: ["科幻", "sci-fi", "太空", "宇宙", "星舰", "外星"],
    mystery: ["侦探", "悬疑", "mystery", "推理", "案件", "谋杀"],
    wuxia: ["武侠", "江湖", "武功", "侠客", "门派"],
    steampunk: ["蒸汽朋克", "steampunk", "蒸汽", "齿轮", "维多利亚"],
    school: ["校园", "学校", "学生", "青春", "教室"],
  };

  for (const [genre, words] of Object.entries(keywords)) {
    if (words.some((w) => lower.includes(w))) {
      return genre;
    }
  }

  return null;
}
