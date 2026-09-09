import { AuthoringError } from "@/lib/authoring/errors";
import { StoryGraphSchema, type StoryGraph } from "@/lib/authoring/schemas";
import type { InteractiveTurnRecord } from "./schemas";

export interface InteractivePathMaterializationInput {
  versionId: string;
  projectTitle: string;
  turns: readonly InteractiveTurnRecord[];
}

function pathError(message: string): AuthoringError {
  return new AuthoringError("VALIDATION", message);
}

export function materializeInteractivePath(input: InteractivePathMaterializationInput): StoryGraph {
  if (input.turns.length < 2) {
    throw pathError("至少需要一个选择和一个结局才能保存正式故事草稿。");
  }

  const turns = [...input.turns];
  turns.forEach((turn, index) => {
    const expectedTurn = index + 1;
    if (turn.turn !== expectedTurn) {
      throw pathError("互动回合必须连续，无法保存不完整的分支路径。");
    }
  });

  const finalTurn = turns.at(-1);
  if (!finalTurn?.scene.isEnding) {
    throw pathError("只有已经生成结局的分支路径才能保存正式故事草稿。");
  }
  if (finalTurn.selectedChoiceId || finalTurn.selectedChoiceLabel) {
    throw pathError("结局回合不能再包含已选择的动作。");
  }

  const chapterId = `${input.versionId}:chapter:branch-writing`;
  const createdAt = turns[0].createdAt;
  const graph: StoryGraph = {
    versionId: input.versionId,
    chapters: [{
      id: chapterId,
      versionId: input.versionId,
      ordinal: 0,
      title: "作者选择路径",
      goal: "把作者实际选择的方向整理成一条可编辑的故事主线。",
      summary: `从“${input.projectTitle}”的分支写作流程中生成的主线路径。`,
      createdAt,
      updatedAt: finalTurn.createdAt,
    }],
    nodes: turns.map((turn, index) => {
      const isStart = index === 0;
      const isEnding = turn.scene.isEnding;
      return {
        id: `${input.versionId}:node:turn-${turn.turn}`,
        versionId: input.versionId,
        chapterId,
        nodeKey: `branch-turn-${turn.turn}`,
        kind: isStart ? "start" : isEnding ? "ending" : "scene",
        title: turn.scene.title,
        body: turn.scene.body,
        summary: turn.scene.summary,
        objective: isEnding ? (turn.scene.endingSummary ?? "收束主线并保留作者选择的后果。") : turn.scene.summary,
        topologicalRank: index,
        contentStatus: "generated",
        authorModified: false,
        contentRevision: 0,
        createdAt: turn.createdAt,
        updatedAt: turn.createdAt,
      };
    }),
    edges: turns.slice(0, -1).map((turn, index) => {
      const selectedChoice = turn.scene.choices.find((choice) => choice.id === turn.selectedChoiceId);
      if (!turn.selectedChoiceId || !selectedChoice) {
        throw pathError(`第 ${turn.turn} 幕缺少真实有效的 selected choice，无法保存分支路径。`);
      }

      const sourceNodeId = `${input.versionId}:node:turn-${turn.turn}`;
      const targetNodeId = `${input.versionId}:node:turn-${turns[index + 1].turn}`;
      return {
        id: `${input.versionId}:edge:turn-${turn.turn}`,
        versionId: input.versionId,
        sourceNodeId,
        targetNodeId,
        label: selectedChoice.label,
        intent: selectedChoice.intent,
        consequenceSummary: selectedChoice.consequencePreview,
        branchType: "main" as const,
        sortOrder: 0,
        createdAt: turn.createdAt,
        updatedAt: turn.createdAt,
      };
    }),
  };

  return StoryGraphSchema.parse(graph);
}
