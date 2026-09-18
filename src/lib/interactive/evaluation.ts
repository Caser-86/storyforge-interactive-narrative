import { z } from "zod";
import { AuthoringError } from "@/lib/authoring/errors";
import type { Project } from "@/lib/authoring/schemas";
import { InteractiveContinuitySchema, InteractiveSceneSchema, type InteractiveChoice, type InteractiveScene } from "./schemas";
import type { GenerationProvider } from "@/lib/authoring/generation/provider";
import { classifyProviderError } from "@/lib/authoring/generation/provider-errors";
import { FakeInteractiveGenerationProvider } from "./fake-provider";
import { createInteractiveState, generateInteractiveScene, type InteractiveGenerationResult } from "./generator";
import { generateWithInteractiveRetry } from "./retry";

const InteractiveEvaluationRiskSchema = z.enum(["low", "medium", "high"]);
const expectedTurnsByPreset = { micro: 6, short: 8, medium: 16 } as const;

export const InteractiveEvaluationFixtureSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(120),
    premise: z.string().min(1).max(4_000),
    genre: z.string().min(1).max(80),
    tone: z.string().min(1).max(160),
    pointOfView: z.string().min(1).max(80),
    rating: z.string().min(1).max(32),
    language: z.literal("zh-CN"),
    sizePreset: z.enum(["micro", "short", "medium"]),
    targetTurns: z.union([z.literal(6), z.literal(8), z.literal(16)]),
    riskSequence: z.array(InteractiveEvaluationRiskSchema).min(1).max(15),
  })
  .strict()
  .superRefine((fixture, context) => {
    if (expectedTurnsByPreset[fixture.sizePreset] !== fixture.targetTurns) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetTurns"],
        message: "Target turns must match the selected size preset.",
      });
    }
    if (fixture.riskSequence.length !== fixture.targetTurns - 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskSequence"],
        message: "Risk sequence must contain one choice for every non-ending turn.",
      });
    }
  });

export type InteractiveEvaluationFixture = z.infer<typeof InteractiveEvaluationFixtureSchema>;

export const InteractiveEvaluationResultSchema = z
  .object({
    schema: z.literal("storyforge-interactive-evaluation@1"),
    fixtureId: z.string().min(1),
    passed: z.boolean(),
    targetTurns: z.number().int().min(2),
    generatedTurns: z.number().int().min(0),
    activeSceneCount: z.number().int().min(0),
    endingPass: z.boolean(),
    choiceContractPass: z.boolean(),
    riskCoveragePass: z.boolean(),
    consequencePass: z.boolean(),
    selectedRisks: z.array(InteractiveEvaluationRiskSchema),
    issueCodes: z.array(z.string().min(1)),
  })
  .strict();

export type InteractiveEvaluationResult = z.infer<typeof InteractiveEvaluationResultSchema>;

export const InteractiveEvaluationTraceTurnSchema = z
  .object({
    turn: z.number().int().positive(),
    scene: InteractiveSceneSchema,
    selectedChoiceLabel: z.string().min(1).nullable(),
    stateLastChoiceImpact: z.string(),
    continuity: InteractiveContinuitySchema.nullable(),
  })
  .strict();

export type InteractiveEvaluationTraceTurn = z.infer<typeof InteractiveEvaluationTraceTurnSchema>;

export type InteractiveEvaluationOptions = {
  onTurn?: (turn: InteractiveEvaluationTraceTurn) => void;
};

const targetNodeCountByTurns = { 6: 8, 8: 10, 16: 18 } as const;

function evaluationProject(fixture: InteractiveEvaluationFixture): Project {
  const targetNodeCount = targetNodeCountByTurns[fixture.targetTurns];
  return {
    id: `evaluation-${fixture.id}`,
    title: fixture.title,
    premise: fixture.premise,
    genre: fixture.genre,
    tone: fixture.tone,
    pointOfView: fixture.pointOfView,
    rating: fixture.rating,
    sizePreset: fixture.sizePreset,
    targetNodeCount,
    targetEndingCount: 2,
    status: "ready",
    activeDraftVersionId: null,
    settingsJson: { language: fixture.language },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function resultFor(
  fixture: InteractiveEvaluationFixture,
  values: Omit<InteractiveEvaluationResult, "schema" | "fixtureId" | "targetTurns" | "passed"> & { passed?: boolean },
): InteractiveEvaluationResult {
  const result = {
    schema: "storyforge-interactive-evaluation@1" as const,
    fixtureId: fixture.id,
    targetTurns: fixture.targetTurns,
    ...values,
    passed: values.passed ?? (
      values.generatedTurns === fixture.targetTurns
      && values.activeSceneCount === fixture.targetTurns - 1
      && values.endingPass
      && values.choiceContractPass
      && values.riskCoveragePass
      && values.consequencePass
      && values.issueCodes.length === 0
    ),
  };
  return InteractiveEvaluationResultSchema.parse(result);
}

export async function evaluateInteractiveFixture(
  fixtureInput: unknown,
  provider: GenerationProvider = new FakeInteractiveGenerationProvider(),
  options: InteractiveEvaluationOptions = {},
): Promise<InteractiveEvaluationResult> {
  const fixture = InteractiveEvaluationFixtureSchema.parse(fixtureInput);
  const project = evaluationProject(fixture);
  const issueCodes = new Set<string>();
  const selectedRisks: Array<z.infer<typeof InteractiveEvaluationRiskSchema>> = [];
  let state = createInteractiveState(project, `evaluation-${fixture.id}`);
  let previousScene: InteractiveScene | null = null;
  let generatedTurns = 0;
  let activeSceneCount = 0;
  let endingPass = false;
  let choiceContractPass = true;
  let consequencePass = true;

  try {
    for (let turnIndex = 0; turnIndex < fixture.targetTurns; turnIndex += 1) {
      const selectedChoice: InteractiveChoice | null | undefined = turnIndex === 0
        ? null
        : previousScene?.choices.find((choice) => choice.risk === fixture.riskSequence[turnIndex - 1]);
      if (turnIndex > 0) {
        const expectedRisk = fixture.riskSequence[turnIndex - 1];
        if (!selectedChoice) {
          issueCodes.add("CHOICE_RISK_UNAVAILABLE");
          break;
        }
        selectedRisks.push(selectedChoice.risk);
        if (selectedChoice.risk !== expectedRisk || selectedChoice.consequencePreview.trim().length === 0) {
          consequencePass = false;
          issueCodes.add("CHOICE_CONSEQUENCE");
        }
      }

      const currentState = state;
      const currentPreviousScene = previousScene;
      const generated: InteractiveGenerationResult = await generateWithInteractiveRetry<InteractiveGenerationResult>(
        (signal): Promise<InteractiveGenerationResult> => generateInteractiveScene({
          project,
          state: currentState,
          previousScene: currentPreviousScene,
          selectedChoice,
          signal,
        }, provider),
        { delayMs: 0, retrySchemaFailures: true },
      );
      generatedTurns += 1;
      if (turnIndex === fixture.targetTurns - 1) {
        endingPass = generated.scene.isEnding
          && generated.scene.choices.length === 0
          && Boolean(generated.scene.endingSummary?.trim());
        if (!endingPass) issueCodes.add("ENDING_CONTRACT");
      } else {
        activeSceneCount += 1;
        if (generated.scene.isEnding || generated.scene.choices.length !== 3) {
          choiceContractPass = false;
          issueCodes.add("CHOICE_CONTRACT");
        }
      }
      if (selectedChoice && (generated.state.turn !== state.turn + 1 || generated.state.lastChoiceImpact.trim().length === 0)) {
        consequencePass = false;
        issueCodes.add("STATE_CONSEQUENCE");
      }
      options.onTurn?.({
        turn: turnIndex + 1,
        scene: generated.scene,
        selectedChoiceLabel: selectedChoice?.label ?? null,
        stateLastChoiceImpact: generated.state.lastChoiceImpact,
        continuity: generated.state.continuity ?? null,
      });
      state = generated.state;
      previousScene = generated.scene;
    }
  } catch (error) {
    const errorCode = error instanceof AuthoringError ? error.code : classifyProviderError(error).code;
    issueCodes.add(`GENERATION_${errorCode}`);
  }

  const riskCoveragePass = selectedRisks.length === fixture.riskSequence.length
    && selectedRisks.every((risk, index) => risk === fixture.riskSequence[index]);
  if (!riskCoveragePass) issueCodes.add("RISK_SEQUENCE");
  return resultFor(fixture, {
    generatedTurns,
    activeSceneCount,
    endingPass,
    choiceContractPass,
    riskCoveragePass,
    consequencePass,
    selectedRisks,
    issueCodes: [...issueCodes],
  });
}

function reviewRiskLabel(risk: InteractiveScene["choices"][number]["risk"]): string {
  return risk === "low" ? "低风险" : risk === "medium" ? "中风险" : "高风险";
}

export function renderInteractiveEvaluationReviewMarkdown(input: {
  fixture: InteractiveEvaluationFixture;
  result: InteractiveEvaluationResult;
  provider: "fake" | "live";
  model: string;
  evaluatedAt: string;
  turns: readonly InteractiveEvaluationTraceTurn[];
}): string {
  const fixture = InteractiveEvaluationFixtureSchema.parse(input.fixture);
  const result = InteractiveEvaluationResultSchema.parse(input.result);
  const turns = input.turns.map((turn) => InteractiveEvaluationTraceTurnSchema.parse(turn));
  const lines = [
    `# 互动人工审阅样本：${fixture.title}`,
    "",
    `- 样本：${fixture.id}`,
    `- Provider：${input.provider}`,
    `- 模型：${input.model}`,
    `- 评测时间：${input.evaluatedAt}`,
    `- 目标幕数：${fixture.targetTurns}`,
    `- 结构结果：${result.passed ? "通过" : "不通过"}`,
    `- 结构问题码：${result.issueCodes.length > 0 ? result.issueCodes.join(", ") : "无"}`,
    `- 风险路径：${result.selectedRisks.join(" -> ")}`,
    "",
    "> 本文件只包含经过场景契约校验的最终文本、摘要、选择和直接后果，不包含 prompt、原始 provider 响应或密钥。",
    "",
  ];

  for (const turn of turns) {
    lines.push(`## 第 ${turn.turn} 幕：${turn.scene.title}`, "", turn.scene.body.trim(), "", `> 摘要：${turn.scene.summary.trim()}`, "");
    if (turn.selectedChoiceLabel) lines.push(`**进入本幕的作者选择：** ${turn.selectedChoiceLabel}`, "");
    if (turn.stateLastChoiceImpact.trim()) lines.push(`**模型记录的直接后果：** ${turn.stateLastChoiceImpact.trim()}`, "");
    if (turn.continuity) {
      lines.push(`**连续性账本：** 地点：${turn.continuity.location}；时间：${turn.continuity.time}；在场：${turn.continuity.activeCharacters.join("、")}；目标：${turn.continuity.sceneGoal}`, "");
    } else {
      lines.push("**连续性账本：** 本幕未返回，人工检查是否承接前文。", "");
    }
    if (turn.scene.choices.length > 0) {
      lines.push("### 本幕可选方向", "");
      for (const choice of turn.scene.choices) {
        lines.push(`- ${choice.label}（${reviewRiskLabel(choice.risk)}）：${choice.consequencePreview}`);
      }
      lines.push("");
    }
    if (turn.scene.isEnding && turn.scene.endingSummary) lines.push(`**结局摘要：** ${turn.scene.endingSummary}`, "");
  }

  return `${lines.join("\n").trim()}\n`;
}
