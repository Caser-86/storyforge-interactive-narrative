import { NextResponse } from "next/server";
import { GENRE_PRESETS } from "@/lib/prompts";

export interface StyleTemplate {
  id: string;
  label: string;
  genre: string;
  description: string;
  difficulty: "easy" | "normal" | "hard";
  lengthPreset: "short" | "medium" | "long";
  visualStyle: string;
  samplePrompt: string;
}

const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: "cyberpunk-noir",
    label: "赛博朋克·暗巷侦探",
    genre: "cyberpunk",
    description: "霓虹灯下的阴谋与背叛，在数据洪流中寻找真相",
    difficulty: "normal",
    lengthPreset: "medium",
    visualStyle: "neon-lit urban, rain-soaked streets, holographic ads",
    samplePrompt: "一个赛博朋克侦探在雨夜追踪失踪的AI",
  },
  {
    id: "dark-fantasy",
    label: "暗黑奇幻·命运之剑",
    genre: "dark_fantasy",
    description: "在崩坏的王国中，每一步都可能踏入深渊",
    difficulty: "hard",
    lengthPreset: "long",
    visualStyle: "gothic castles, cursed forests, ancient runes",
    samplePrompt: "一位被放逐的骑士踏上寻找失落王冠的旅途",
  },
  {
    id: "horror-mystery",
    label: "恐怖悬疑·旧校舍",
    genre: "horror",
    description: "午夜的钟声响起，每一扇门后都藏着不可名状之物",
    difficulty: "hard",
    lengthPreset: "short",
    visualStyle: "dim corridors, flickering lights, unsettling shadows",
    samplePrompt: "深夜收到一封来自已故同学的邀请函",
  },
  {
    id: "scifi-exploration",
    label: "科幻探索·深空漂流",
    genre: "sci-fi",
    description: "在无垠星海中，孤独的飞船驶向未知",
    difficulty: "normal",
    lengthPreset: "medium",
    visualStyle: "vast space, alien landscapes, futuristic tech",
    samplePrompt: "一艘深空探测船在未知星系发现异常信号",
  },
  {
    id: "steampunk-adv",
    label: "蒸汽朋克·齿轮之城",
    genre: "steampunk",
    description: "齿轮与蒸汽驱动的冒险，在机械世界中寻找自由",
    difficulty: "easy",
    lengthPreset: "medium",
    visualStyle: "brass machinery, steam clouds, clockwork mechanisms",
    samplePrompt: "一位发明家在齿轮之城发现了改变世界的蓝图",
  },
  {
    id: "post-apoc",
    label: "末日废土·荒原行者",
    genre: "post_apocalyptic",
    description: "文明崩塌后的世界，生存是唯一的法则",
    difficulty: "hard",
    lengthPreset: "long",
    visualStyle: "desolate wasteland, ruined cities, makeshift camps",
    samplePrompt: "一个流浪者在核冬天后寻找传说中的避难所",
  },
  {
    id: "court-intrigue",
    label: "宫廷权谋·暗流涌动",
    genre: "historical",
    description: "华丽的宫殿之下，暗杀与阴谋从未停歇",
    difficulty: "normal",
    lengthPreset: "medium",
    visualStyle: "ornate palaces, silk curtains, candlelit chambers",
    samplePrompt: "一位新晋侍臣卷入了皇位继承的漩涡",
  },
  {
    id: "campfire-tale",
    label: "篝火怪谈·午夜传说",
    genre: "folk_horror",
    description: "围坐篝火旁，每个故事都可能成真",
    difficulty: "normal",
    lengthPreset: "short",
    visualStyle: "campfire glow, dark woods, folk symbols",
    samplePrompt: "一群露营者在深山老林听到不该听到的故事",
  },
];

export async function GET() {
  const genres = Object.entries(GENRE_PRESETS).map(([key, preset]) => ({
    id: key,
    styleBible: preset.styleBible,
    promptHint: preset.promptHint,
  }));

  return NextResponse.json({
    templates: STYLE_TEMPLATES,
    genres,
  });
}
