import { z } from "zod";
import { InteractiveTurnRecordSchema } from "./schemas";

export const InteractiveExportSchema = z
  .object({
    exportVersion: z.literal("storyforge-interactive@1"),
    project: z
      .object({
        title: z.string().min(1),
        premise: z.string().min(1),
        genre: z.string().min(1),
        tone: z.string().min(1),
      })
      .strict(),
    session: z
      .object({
        id: z.string().min(1),
        status: z.enum(["generating", "active", "ended", "failed"]),
        targetTurns: z.number().int().min(2).max(40),
      })
      .strict(),
    turns: z.array(InteractiveTurnRecordSchema).min(1),
  })
  .strict();

export type InteractiveExport = z.infer<typeof InteractiveExportSchema>;

export function renderInteractiveJson(input: InteractiveExport): string {
  return `${JSON.stringify(InteractiveExportSchema.parse(input), null, 2)}\n`;
}

export function renderInteractiveMarkdown(input: InteractiveExport): string {
  const exportData = InteractiveExportSchema.parse(input);
  const lines = [
    `# ${exportData.project.title}`,
    "",
    `> ${exportData.project.premise}`,
    ">",
    `> 类型：${exportData.project.genre}　基调：${exportData.project.tone}`,
    "",
    `状态：${exportData.session.status === "ended" ? "已结束" : "进行中"}　目标幕数：${exportData.session.targetTurns}`,
    "",
  ];

  for (const turn of exportData.turns) {
    lines.push(`## 第 ${turn.turn} 幕：${turn.scene.title}`, "", turn.scene.body, "", `> ${turn.scene.summary}`, "");
    if (turn.selectedChoiceLabel) lines.push(`**已选择：** ${turn.selectedChoiceLabel}`, "");
    if (turn.scene.isEnding && turn.scene.endingSummary) lines.push(`**结局：** ${turn.scene.endingSummary}`, "");
  }

  return `${lines.join("\n").trim()}\n`;
}
