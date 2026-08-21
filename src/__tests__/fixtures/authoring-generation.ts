import type { GenerationProjectContext } from "@/lib/authoring/generation/prompts";
import type { GraphOutput, OutlineOutput } from "@/lib/authoring/generation/stages/types";

export const generationContext: GenerationProjectContext = {
  projectId: "project-1",
  versionId: "version-1",
  title: "Clockwork Orchard",
  premise: "A courier discovers a machine-grown forest beneath the city.",
  genre: "solarpunk mystery",
  tone: "hopeful suspense",
  pointOfView: "second person",
  rating: "PG-13",
  language: "English",
  size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
};

export const briefFixture = {
  title: "Clockwork Orchard",
  premise: "A courier uncovers a living machine beneath the city.",
  promise: "Every choice trades safety for truth.",
  genre: "solarpunk mystery",
  tone: "hopeful suspense",
  audience: "young adult",
};

export const bibleFixture = {
  worldRules: ["Machines can grow living tissue.", "Public records erase the orchard."],
  themes: ["truth and stewardship"],
  characters: [
    {
      id: "char-courier",
      name: "Mara",
      role: "protagonist",
      traits: ["observant", "pragmatic"],
      goal: "Find the missing route.",
      secret: "She once delivered a sealed orchard map.",
    },
  ],
  canonFacts: ["The orchard predates the city grid."],
  forbiddenChanges: ["Do not make the orchard supernatural."],
};

export const outlineFixture: OutlineOutput = {
  chapters: [
    { id: "chapter-1", title: "Below the Tramline", goal: "Find the orchard entrance.", summary: "Mara follows a service map below the city." },
  ],
  nodes: [
    { id: "node-start", chapterId: "chapter-1", kind: "start", title: "The Service Door", objective: "Enter the hidden route." },
    { id: "node-left", chapterId: "chapter-1", kind: "scene", title: "The Seed Vault", objective: "Choose whether to open the vault." },
    { id: "node-right", chapterId: "chapter-1", kind: "scene", title: "The Flooded Tunnel", objective: "Find another way forward." },
    { id: "node-left-end", chapterId: "chapter-1", kind: "ending", title: "Keep the Seed", objective: "Protect the orchard." },
    { id: "node-right-end", chapterId: "chapter-1", kind: "ending", title: "Expose the Orchard", objective: "Reveal the city secret." },
  ],
};

export const graphFixture: GraphOutput = {
  chapters: outlineFixture.chapters,
  nodes: outlineFixture.nodes.map((node, index) => ({
    ...node,
    summary: `${node.title} summary.`,
    topologicalRank: index,
  })),
  edges: [
    { id: "edge-start-left", sourceNodeId: "node-start", targetNodeId: "node-left", label: "Open the vault", intent: "seek truth", consequenceSummary: "The vault wakes.", branchType: "main", sortOrder: 0 },
    { id: "edge-start-right", sourceNodeId: "node-start", targetNodeId: "node-right", label: "Take the tunnel", intent: "avoid danger", consequenceSummary: "The tunnel floods.", branchType: "side", sortOrder: 1 },
    { id: "edge-left-ending", sourceNodeId: "node-left", targetNodeId: "node-left-end", label: "Keep the seed", intent: "protect life", consequenceSummary: "The orchard survives.", branchType: "main", sortOrder: 0 },
    { id: "edge-left-right-ending", sourceNodeId: "node-left", targetNodeId: "node-right-end", label: "Tell the city", intent: "share truth", consequenceSummary: "The orchard becomes public.", branchType: "side", sortOrder: 1 },
    { id: "edge-right-ending", sourceNodeId: "node-right", targetNodeId: "node-right-end", label: "Tell the city", intent: "share truth", consequenceSummary: "The orchard becomes public.", branchType: "main", sortOrder: 0 },
  ],
};
