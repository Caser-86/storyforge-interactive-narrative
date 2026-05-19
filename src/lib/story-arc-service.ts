import type { StoryState, StoryPhase } from "./schemas";

export function getPhaseForTurn(turn: number, targetTurns: number): StoryPhase {
  const progress = turn / targetTurns;
  if (progress <= 0.2) return "setup";
  if (progress <= 0.55) return "development";
  if (progress <= 0.75) return "crisis";
  if (progress <= 0.9) return "resolution";
  return "ending";
}

export function getPhaseInstruction(state: StoryState): string {
  const remainingTurns = state.targetTurns - state.turn;
  const phase = state.currentPhase;

  const instructions: Record<StoryPhase, string> = {
    setup: "当前处于故事开端阶段。建立人物、地点、主冲突，不要急于揭示全部真相。引入核心悬念和关键NPC。",
    development: "当前处于故事展开阶段。扩展线索、角色关系、分支后果。允许引入新伏笔，但必须承接旧选择的影响。",
    crisis: "当前处于危机阶段。引爆冲突，暴露代价，核心矛盾必须激化。减少新伏笔的引入，聚焦已有线索。",
    resolution: "当前处于收束阶段。回收伏笔，明确最终目标，准备结局方向。禁止引入重要新主线伏笔。必须推进至少1个未解决线索。",
    ending: "当前处于结局阶段。生成最终抉择和结局，不再开新线。必须回收关键伏笔，给出明确结局方向。",
  };

  let instruction = instructions[phase];

  if (remainingTurns <= 3 && remainingTurns > 1) {
    instruction += "\n\n紧急：剩余步数不足3步！必须：1) 回收至少1个旧伏笔；2) 不引入新关键NPC；3) 选择必须导向结局差异。";
  }

  if (remainingTurns <= 1) {
    instruction += "\n\n最终幕：当前幕就是结局幕！必须：1) 正文交代玩家选择造成的结果；2) 引用至少2个早期选择或关键事实；3) 给出明确的结局总结。";
  }

  if (state.unresolvedThreads.length > 5) {
    instruction += `\n\n警告：未解决伏笔过多（${state.unresolvedThreads.length}个），必须回收至少2个旧线索，不能再引入新伏笔。`;
  }

  return instruction;
}

export function shouldForceResolution(state: StoryState): boolean {
  const remainingTurns = state.targetTurns - state.turn;
  if (remainingTurns <= 3) return true;
  if (state.unresolvedThreads.length > 5) return true;
  if (state.currentPhase === "resolution" || state.currentPhase === "ending") return true;
  return false;
}

export function shouldEndStory(state: StoryState): boolean {
  if (state.turn >= state.targetTurns) return true;
  if (state.turn >= state.maxTurns) return true;
  if (state.currentPhase === "ending" && state.endingReadiness >= 80) return true;
  if (state.currentPhase === "ending" && state.endingPotential >= 80) return true;
  return false;
}

export function advanceStoryArc(state: StoryState): StoryState {
  const newPhase = getPhaseForTurn(state.turn, state.targetTurns);
  const phaseChanged = newPhase !== state.currentPhase;
  const allowNewThreads = newPhase === "setup" || newPhase === "development";

  let endingReadiness = state.endingReadiness;
  if (state.currentPhase === "resolution") {
    endingReadiness = Math.min(100, endingReadiness + 15);
  } else if (state.currentPhase === "ending") {
    endingReadiness = Math.min(100, endingReadiness + 25);
  } else if (state.currentPhase === "crisis") {
    endingReadiness = Math.min(100, endingReadiness + 5);
  }

  return {
    ...state,
    currentPhase: newPhase,
    phaseStartedAtTurn: phaseChanged ? state.turn : state.phaseStartedAtTurn,
    allowNewThreads,
    endingReadiness,
  };
}

export function determineEndingType(state: StoryState): "success" | "bittersweet" | "failure" | "open" {
  const dangerLevel = state.variables.danger_level ?? 0;
  const tension = state.variables.tension ?? 0;
  const resolvedCount = state.resolvedThreads.length;
  const unresolvedCount = state.unresolvedThreads.length;

  const npcRelationValues = Object.values(state.npcRelations);
  const avgNpcRelation = npcRelationValues.length > 0
    ? npcRelationValues.reduce((a, b) => a + b, 0) / npcRelationValues.length
    : 0;

  let successScore = 0;
  if (dangerLevel <= 20) successScore += 2;
  if (resolvedCount >= unresolvedCount) successScore += 2;
  if (avgNpcRelation > 20) successScore += 1;
  if (tension <= 40) successScore += 1;

  if (successScore >= 4) return "success";
  if (successScore >= 2) return "bittersweet";
  if (dangerLevel >= 60 || tension >= 70) return "failure";
  return "open";
}
