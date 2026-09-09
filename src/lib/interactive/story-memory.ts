import { z } from "zod";

export const StoryMemoryFactSchema = z
  .object({
    id: z.string().min(1).max(80),
    content: z.string().trim().min(1).max(240),
    immutable: z.boolean(),
  })
  .strict();

export const StoryMemoryThreadSchema = z
  .object({
    id: z.string().min(1).max(80),
    summary: z.string().trim().min(1).max(300),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["open", "resolved"]),
  })
  .strict();

export const StoryMemorySchema = z
  .object({
    mainlineFacts: z.array(StoryMemoryFactSchema).max(20),
    plotThreads: z.array(StoryMemoryThreadSchema).max(20),
    recentSummaries: z.array(z.string().trim().min(1).max(300)).max(6),
  })
  .strict();

export const StoryMemoryPatchSchema = z
  .object({
    mainlineFacts: z.array(StoryMemoryFactSchema).max(20).optional(),
    plotThreads: z.array(StoryMemoryThreadSchema).max(20).optional(),
    resolvedThreadIds: z.array(z.string().min(1).max(80)).max(20).optional(),
  })
  .strict();

export type StoryMemoryFact = z.infer<typeof StoryMemoryFactSchema>;
export type StoryMemoryThread = z.infer<typeof StoryMemoryThreadSchema>;
export type StoryMemory = z.infer<typeof StoryMemorySchema>;

export interface StoryMemoryPatch {
  mainlineFacts: StoryMemoryFact[];
  plotThreads: StoryMemoryThread[];
  resolvedThreadIds: string[];
  recentSummary?: string;
  legacyFacts?: string[];
  legacyThreads?: string[];
  legacyResolvedThreads?: string[];
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function stableMemoryId(kind: "fact" | "thread", content: string): string {
  return `${kind}-${stableHash(content.trim().toLocaleLowerCase())}`;
}

function normalizedMemory(memory: StoryMemory | null | undefined): StoryMemory {
  const parsed = StoryMemorySchema.safeParse(memory ?? null);
  return parsed.success ? parsed.data : { mainlineFacts: [], plotThreads: [], recentSummaries: [] };
}

function boundedFacts(facts: StoryMemoryFact[]): StoryMemoryFact[] {
  const unique = new Map<string, StoryMemoryFact>();
  for (const fact of facts) {
    const current = unique.get(fact.id);
    unique.set(fact.id, current ? { ...current, ...fact, immutable: current.immutable || fact.immutable } : fact);
  }
  const ordered = [...unique.values()];
  const immutable = ordered.filter((fact) => fact.immutable);
  const mutable = ordered.filter((fact) => !fact.immutable);
  const availableMutable = Math.max(0, 20 - immutable.length);
  const mutableTail = availableMutable > 0 ? mutable.slice(-availableMutable) : [];
  return [...immutable.slice(0, 20), ...mutableTail];
}

function boundedThreads(threads: StoryMemoryThread[]): StoryMemoryThread[] {
  const unique = new Map<string, StoryMemoryThread>();
  for (const thread of threads) {
    const current = unique.get(thread.id);
    unique.set(thread.id, current ? { ...current, ...thread } : thread);
  }
  const ordered = [...unique.values()];
  if (ordered.length <= 20) return ordered;

  const critical = ordered.filter((thread) => thread.status === "open" && thread.priority === "high");
  const remainder = ordered.filter((thread) => !(thread.status === "open" && thread.priority === "high"));
  const criticalWithinBound = critical.slice(-20);
  const remainingSlots = Math.max(0, 20 - criticalWithinBound.length);
  return [...criticalWithinBound, ...remainder.slice(-remainingSlots)];
}

function nonEmptyTrimmed(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

export function mergeStoryMemory(memory: StoryMemory | null | undefined, patch: StoryMemoryPatch): StoryMemory {
  const current = normalizedMemory(memory);
  const legacyFacts = nonEmptyTrimmed(patch.legacyFacts).map((content) => ({ id: stableMemoryId("fact", content), content, immutable: false }));
  const legacyThreads = nonEmptyTrimmed(patch.legacyThreads).map((summary) => ({ id: stableMemoryId("thread", summary), summary, priority: "medium" as const, status: "open" as const }));
  const resolvedIds = new Set([
    ...patch.resolvedThreadIds,
    ...nonEmptyTrimmed(patch.legacyResolvedThreads).map((summary) => stableMemoryId("thread", summary)),
  ]);
  const plotThreads = boundedThreads([
    ...current.plotThreads,
    ...legacyThreads,
    ...patch.plotThreads,
  ]).map((thread) => resolvedIds.has(thread.id) ? { ...thread, status: "resolved" as const } : thread);
  const recentSummaries = patch.recentSummary?.trim()
    ? [...current.recentSummaries.filter((summary) => summary !== patch.recentSummary), patch.recentSummary.trim()].slice(-6)
    : current.recentSummaries;
  return StoryMemorySchema.parse({
    mainlineFacts: boundedFacts([...current.mainlineFacts, ...legacyFacts, ...patch.mainlineFacts]),
    plotThreads,
    recentSummaries,
  });
}

export function storyMemoryForPrompt(memory: StoryMemory | null | undefined): string {
  const current = normalizedMemory(memory);
  const openThreads = current.plotThreads
    .filter((thread) => thread.status === "open")
    .sort((left, right) => {
      const priority = { high: 0, medium: 1, low: 2 } as const;
      return priority[left.priority] - priority[right.priority];
    });
  return JSON.stringify({
    mainlineFacts: current.mainlineFacts,
    unresolvedThreads: openThreads,
    recentSummaries: current.recentSummaries,
  });
}

export function endingMemoryConstraint(memory: StoryMemory | null | undefined): string {
  const unresolved = normalizedMemory(memory).plotThreads
    .filter((thread) => thread.status === "open" && thread.priority === "high")
    .map((thread) => `${thread.id}: ${thread.summary}`);
  return unresolved.length > 0
    ? `收尾时必须优先回应这些高优先级未解伏笔，不得无解释地丢弃：${unresolved.join("；")}`
    : "收尾时优先回应仍未解决的主线伏笔，并解释作者选择带来的后果。";
}
