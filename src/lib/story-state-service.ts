import type { StoryState, Choice, StoryLengthPreset } from "./schemas";
import { STORY_LENGTH_CONFIG } from "./schemas";

const MAX_KNOWN_FACTS = 30;
const MAX_UNRESOLVED_THREADS = 10;
const MAX_RESOLVED_THREADS = 30;
const MAX_INVENTORY = 30;
const UNRESOLVED_FORCE_RECYCLE_THRESHOLD = 5;
const MIN_VARIABLE = -100;
const MAX_VARIABLE = 100;
const MIN_NPC_RELATION = -100;
const MAX_NPC_RELATION = 100;
const MAX_ENDING_POTENTIAL = 100;

function dedupAndCap(arr: string[], max: number): string[] {
  const unique = [...new Set(arr)];
  return unique.slice(-max);
}

function clampVariable(value: number): number {
  return Math.max(MIN_VARIABLE, Math.min(MAX_VARIABLE, value));
}

export function createInitialState(
  sessionId: string,
  _seedPrompt: string,
  storyLengthPreset: StoryLengthPreset = "short",
  customTargetTurns?: number
): StoryState {
  const config = STORY_LENGTH_CONFIG[storyLengthPreset];
  const targetTurns = storyLengthPreset === "custom" && customTargetTurns
    ? Math.max(config.minTurns, Math.min(config.maxTurns, customTargetTurns))
    : config.defaultTarget;

  return {
    sessionId,
    chapter: 1,
    turn: 1,
    tone: "",
    protagonist: {
      name: "未命名主角",
      traits: [],
    },
    variables: {
      tension: 10,
      danger_level: 0,
    },
    inventory: [],
    knownFacts: [],
    unresolvedThreads: [],
    resolvedThreads: [],
    flags: {},
    npcRelations: {},
    endingPotential: 0,
    styleBible: {
      visualStyle: "",
      musicStyle: "",
    },
    storyLengthPreset,
    targetTurns,
    minTurns: config.minTurns,
    maxTurns: config.maxTurns,
    currentPhase: "setup",
    storyGoal: "",
    endCondition: "",
    phaseStartedAtTurn: 1,
    endingReadiness: 0,
    allowNewThreads: true,
    endingType: null,
    endingSummary: "",
    lastChoiceImpact: "",
  };
}

export function applyChoiceEffects(
  state: StoryState,
  choice: Choice,
  statePatch: Record<string, unknown>
): StoryState {
  const newState = {
    ...state,
    variables: { ...state.variables },
    flags: { ...state.flags },
    npcRelations: { ...state.npcRelations },
  };

  for (const [key, value] of Object.entries(choice.stateEffects)) {
    const current = newState.variables[key] ?? 0;
    newState.variables[key] = current + value;
  }

  for (const [key, value] of Object.entries(statePatch)) {
    if (key === "inventory" && Array.isArray(value)) {
      newState.inventory = [...newState.inventory, ...value as string[]];
    } else if (key === "knownFacts" && Array.isArray(value)) {
      newState.knownFacts = [...newState.knownFacts, ...value as string[]];
    } else if (key === "unresolvedThreads" && Array.isArray(value)) {
      if (newState.allowNewThreads) {
        newState.unresolvedThreads = [...newState.unresolvedThreads, ...value as string[]];
      }
    } else if (key === "resolvedThreads" && Array.isArray(value)) {
      newState.resolvedThreads = [...newState.resolvedThreads, ...value as string[]];
    } else if (key === "lastChoiceImpact" && typeof value === "string") {
      newState.lastChoiceImpact = value;
    } else if (key === "flags" && typeof value === "object" && value !== null) {
      Object.assign(newState.flags, value as Record<string, boolean>);
    } else if (key === "npcRelations" && typeof value === "object" && value !== null) {
      for (const [npcId, delta] of Object.entries(value as Record<string, number>)) {
        const current = newState.npcRelations[npcId] ?? 0;
        newState.npcRelations[npcId] = Math.max(MIN_NPC_RELATION, Math.min(MAX_NPC_RELATION, current + delta));
      }
    } else if (key === "endingPotential" && typeof value === "number") {
      newState.endingPotential = Math.max(0, Math.min(MAX_ENDING_POTENTIAL, newState.endingPotential + value));
    } else if (key === "endingReadiness" && typeof value === "number") {
      newState.endingReadiness = Math.max(0, Math.min(100, value));
    } else if (key === "storyGoal" && typeof value === "string") {
      newState.storyGoal = value;
    } else if (key === "endCondition" && typeof value === "string") {
      newState.endCondition = value;
    } else if (key === "endingType" && typeof value === "string") {
      newState.endingType = value as StoryState["endingType"];
    } else if (key === "endingSummary" && typeof value === "string") {
      newState.endingSummary = value;
    } else if (key === "tone" && typeof value === "string") {
      newState.tone = value;
    } else if (key === "protagonist" && typeof value === "object" && value !== null) {
      newState.protagonist = { ...newState.protagonist, ...(value as Partial<StoryState["protagonist"]>) };
    } else if (key === "styleBible" && typeof value === "object" && value !== null) {
      newState.styleBible = { ...newState.styleBible, ...(value as Partial<StoryState["styleBible"]>) };
    } else if (typeof value === "number") {
      newState.variables[key] = value as number;
    }
  }

  if (!newState.lastChoiceImpact) {
    newState.lastChoiceImpact = `选择了"${choice.label}"：${choice.intent}`;
  }

  newState.turn = state.turn + 1;

  if (newState.turn > 0 && newState.turn % 10 === 0) {
    newState.chapter = state.chapter + 1;
  }

  newState.endingPotential = Math.min(MAX_ENDING_POTENTIAL, newState.endingPotential + 3);

  if (newState.unresolvedThreads.length > UNRESOLVED_FORCE_RECYCLE_THRESHOLD) {
    const excess = newState.unresolvedThreads.length - UNRESOLVED_FORCE_RECYCLE_THRESHOLD;
    const recycled = newState.unresolvedThreads.slice(0, excess);
    newState.unresolvedThreads = newState.unresolvedThreads.slice(excess);
    newState.resolvedThreads = [...newState.resolvedThreads, ...recycled.map((t) => `[自动回收] ${t}`)];
    newState.allowNewThreads = false;
  } else {
    newState.allowNewThreads = true;
  }

  newState.inventory = dedupAndCap(newState.inventory, MAX_INVENTORY);
  newState.knownFacts = dedupAndCap(newState.knownFacts, MAX_KNOWN_FACTS);
  newState.unresolvedThreads = dedupAndCap(newState.unresolvedThreads, MAX_UNRESOLVED_THREADS);
  newState.resolvedThreads = dedupAndCap(newState.resolvedThreads, MAX_RESOLVED_THREADS);

  for (const key of Object.keys(newState.variables)) {
    newState.variables[key] = clampVariable(newState.variables[key] as number);
  }

  return newState;
}

export function compressContext(state: StoryState): string {
  const lines: string[] = [];
  const remainingTurns = state.targetTurns - state.turn;
  lines.push(`章节${state.chapter}，回合${state.turn}/${state.targetTurns}（剩余${remainingTurns}步），阶段：${state.currentPhase}，基调：${state.tone || "未定"}`);
  lines.push(`主角：${state.protagonist.name}（${state.protagonist.traits.join("、")}）`);
  if (state.storyGoal) {
    lines.push(`故事目标：${state.storyGoal}`);
  }
  if (state.endCondition) {
    lines.push(`结局条件：${state.endCondition}`);
  }
  if (state.lastChoiceImpact) {
    lines.push(`上次选择影响：${state.lastChoiceImpact}`);
  }
  const varEntries = Object.entries(state.variables);
  if (varEntries.length > 0) {
    lines.push(`状态：${varEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  if (state.inventory.length > 0) {
    lines.push(`道具：${state.inventory.join("、")}`);
  }
  if (state.knownFacts.length > 0) {
    lines.push(`已知：${state.knownFacts.join("；")}`);
  }
  if (state.unresolvedThreads.length > 0) {
    lines.push(`未解决伏笔：${state.unresolvedThreads.join("；")}`);
  }
  if (state.resolvedThreads.length > 0) {
    lines.push(`已解决伏笔：${state.resolvedThreads.join("；")}`);
  }
  if (!state.allowNewThreads) {
    lines.push(`⚠ 当前禁止新增伏笔，必须回收旧线索`);
  }
  const flagEntries = Object.entries(state.flags).filter(([, v]) => v);
  if (flagEntries.length > 0) {
    lines.push(`标记：${flagEntries.map(([k]) => k).join("、")}`);
  }
  const npcEntries = Object.entries(state.npcRelations);
  if (npcEntries.length > 0) {
    lines.push(`NPC关系：${npcEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  if (state.endingPotential > 0) {
    lines.push(`结局潜力：${state.endingPotential}/${MAX_ENDING_POTENTIAL}`);
  }
  if (state.endingReadiness > 0) {
    lines.push(`结局准备度：${state.endingReadiness}/100`);
  }
  if (state.styleBible.visualStyle) {
    lines.push(`视觉风格：${state.styleBible.visualStyle}`);
  }
  if (state.styleBible.musicStyle) {
    lines.push(`音乐风格：${state.styleBible.musicStyle}`);
  }
  return lines.join("\n");
}
