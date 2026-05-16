import type { StoryState, Choice } from "./schemas";

export function createInitialState(sessionId: string, seedPrompt: string): StoryState {
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
    styleBible: {
      visualStyle: "",
      musicStyle: "",
    },
  };
}

export function applyChoiceEffects(
  state: StoryState,
  choice: Choice,
  statePatch: Record<string, unknown>
): StoryState {
  const newState = { ...state, variables: { ...state.variables } };

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
      newState.unresolvedThreads = [...newState.unresolvedThreads, ...value as string[]];
    } else if (key === "tone" && typeof value === "string") {
      newState.tone = value;
    } else if (key === "protagonist" && typeof value === "object" && value !== null) {
      newState.protagonist = { ...newState.protagonist, ...(value as Partial<StoryState["protagonist"]>) };
    } else if (key === "styleBible" && typeof value === "object" && value !== null) {
      newState.styleBible = { ...newState.styleBible, ...(value as Partial<StoryState["styleBible"]>) };
    } else if (typeof value === "number") {
      newState.variables[key] = value;
    }
  }

  newState.turn = state.turn + 1;

  return newState;
}

export function compressContext(state: StoryState): string {
  const lines: string[] = [];
  lines.push(`章节${state.chapter}，回合${state.turn}，基调：${state.tone || "未定"}`);
  lines.push(`主角：${state.protagonist.name}（${state.protagonist.traits.join("、")}）`);
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
    lines.push(`伏笔：${state.unresolvedThreads.join("；")}`);
  }
  if (state.styleBible.visualStyle) {
    lines.push(`视觉风格：${state.styleBible.visualStyle}`);
  }
  if (state.styleBible.musicStyle) {
    lines.push(`音乐风格：${state.styleBible.musicStyle}`);
  }
  return lines.join("\n");
}
