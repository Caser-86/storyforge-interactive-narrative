export interface TestPromptFixture {
  id: string;
  prompt: string;
  language: "zh-CN" | "en-US" | "ja-JP";
  rating: "G" | "PG" | "PG-13" | "R";
  lengthPreset: "short" | "medium" | "long";
  genre: string;
  expectedGenre: string | null;
}

export const TEST_PROMPTS_FIXTURES: TestPromptFixture[] = [
  { id: "cyberpunk-zh-short", prompt: "一个赛博朋克风格的侦探悬疑故事，霓虹灯下寻找失踪的AI", language: "zh-CN", rating: "PG-13", lengthPreset: "short", genre: "cyberpunk", expectedGenre: "cyberpunk" },
  { id: "fantasy-zh-medium", prompt: "中世纪奇幻酒馆里的秘密会议，暗流涌动", language: "zh-CN", rating: "PG", lengthPreset: "medium", genre: "fantasy", expectedGenre: "fantasy" },
  { id: "horror-zh-short", prompt: "民俗恐怖：山村里的禁忌仪式，不可说的诅咒", language: "zh-CN", rating: "PG-13", lengthPreset: "short", genre: "horror", expectedGenre: "horror" },
  { id: "scifi-zh-long", prompt: "太空站上的生存危机，氧气即将耗尽，谁是叛徒？", language: "zh-CN", rating: "PG-13", lengthPreset: "long", genre: "scifi", expectedGenre: "scifi" },
  { id: "steampunk-zh-medium", prompt: "蒸汽朋克城市的大盗窃案，齿轮与蒸汽的阴谋", language: "zh-CN", rating: "PG", lengthPreset: "medium", genre: "steampunk", expectedGenre: "steampunk" },
  { id: "mystery-zh-short", prompt: "雨夜列车的失踪案，乘客逐一消失", language: "zh-CN", rating: "PG-13", lengthPreset: "short", genre: "mystery", expectedGenre: "mystery" },
  { id: "wuxia-zh-long", prompt: "战国时代的忍者暗杀，江湖恩怨何时了", language: "zh-CN", rating: "PG-13", lengthPreset: "long", genre: "wuxia", expectedGenre: "wuxia" },
  { id: "school-zh-short", prompt: "校园里流传的诡异传说，午夜教室的钢琴声", language: "zh-CN", rating: "G", lengthPreset: "short", genre: "school", expectedGenre: "school" },
  { id: "postapoc-zh-medium", prompt: "末日公路上的逃亡者，辐射废土中的最后希望", language: "zh-CN", rating: "PG-13", lengthPreset: "medium", genre: "postapoc", expectedGenre: null },
  { id: "court-zh-long", prompt: "古代宫廷的权谋暗斗，皇位背后的血腥真相", language: "zh-CN", rating: "R", lengthPreset: "long", genre: "court", expectedGenre: null },

  { id: "cyberpunk-en-short", prompt: "A noir detective story in a neon-lit cyberpunk city, hunting a rogue AI", language: "en-US", rating: "PG-13", lengthPreset: "short", genre: "cyberpunk", expectedGenre: "cyberpunk" },
  { id: "fantasy-en-medium", prompt: "A secret meeting in a medieval fantasy tavern, dark currents flowing beneath", language: "en-US", rating: "PG", lengthPreset: "medium", genre: "fantasy", expectedGenre: "fantasy" },
  { id: "horror-en-short", prompt: "Folk horror: forbidden rituals in a mountain village, unspeakable curses", language: "en-US", rating: "R", lengthPreset: "short", genre: "horror", expectedGenre: "horror" },
  { id: "scifi-en-long", prompt: "Survival crisis on a space station, oxygen running out, who is the traitor?", language: "en-US", rating: "PG-13", lengthPreset: "long", genre: "scifi", expectedGenre: "scifi" },
  { id: "steampunk-en-medium", prompt: "A grand heist in a steampunk city of gears and steam", language: "en-US", rating: "PG", lengthPreset: "medium", genre: "steampunk", expectedGenre: "steampunk" },
  { id: "school-en-short", prompt: "Eerie rumors spreading through school, piano playing at midnight in the classroom", language: "en-US", rating: "G", lengthPreset: "short", genre: "school", expectedGenre: "school" },
  { id: "postapoc-en-medium", prompt: "Escapees on a post-apocalyptic highway, last hope in radioactive wasteland", language: "en-US", rating: "PG-13", lengthPreset: "medium", genre: "postapoc", expectedGenre: null },
  { id: "mystery-en-short", prompt: "Disappearance case on a rainy night train, passengers vanishing one by one", language: "en-US", rating: "PG-13", lengthPreset: "short", genre: "mystery", expectedGenre: "mystery" },

  { id: "fantasy-ja-short", prompt: "中世ファンタジーの酒場での秘密の会議、暗い流れが渦巻く", language: "ja-JP", rating: "PG", lengthPreset: "short", genre: "fantasy", expectedGenre: null },
  { id: "horror-ja-medium", prompt: "民俗ホラー：山村での禁忌の儀式、語ってはならない呪い", language: "ja-JP", rating: "PG-13", lengthPreset: "medium", genre: "horror", expectedGenre: null },
  { id: "scifi-ja-long", prompt: "宇宙ステーションでの生存危機、酸素が尽きようとしている、裏切り者は誰だ？", language: "ja-JP", rating: "PG-13", lengthPreset: "long", genre: "scifi", expectedGenre: null },
  { id: "school-ja-short", prompt: "校で広まる怪談、真夜中の教室から聞こえるピアノの音", language: "ja-JP", rating: "G", lengthPreset: "short", genre: "school", expectedGenre: null },
];

export const TEST_PROMPTS = TEST_PROMPTS_FIXTURES.map((f) => f.prompt);

export interface RegressionMetrics {
  totalTests: number;
  schemaPassCount: number;
  schemaPassRate: number;
  qualityPassCount: number;
  qualityPassRate: number;
  genreDetectionAccuracy: number;
  byLanguage: Record<string, { total: number; passed: number }>;
  byRating: Record<string, { total: number; passed: number }>;
  byLength: Record<string, { total: number; passed: number }>;
}

export function initMetrics(): RegressionMetrics {
  return {
    totalTests: 0,
    schemaPassCount: 0,
    schemaPassRate: 0,
    qualityPassCount: 0,
    qualityPassRate: 0,
    genreDetectionAccuracy: 0,
    byLanguage: {},
    byRating: {},
    byLength: {},
  };
}
