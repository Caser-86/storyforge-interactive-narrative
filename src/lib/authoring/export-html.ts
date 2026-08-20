import { z } from "zod";
import {
  ReaderChapterSchema,
  ReaderStoryEdgeSchema,
  ReaderStoryGraphSchema,
  ReaderStoryNodeSchema,
  createRuntime,
} from "./runtime";
import type { ReaderChapter, ReaderStoryEdge, ReaderStoryGraph, ReaderStoryNode } from "./runtime";
import { AuthoringError } from "./errors";

const ExportSnapshotSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionNumber: z.number().int().min(1),
    createdAt: z.string().min(1),
    sealedAt: z.string().min(1),
  })
  .strict();

const ExportStorySchema = z
  .object({
    snapshot: ExportSnapshotSchema,
    graph: ReaderStoryGraphSchema,
  })
  .strict();

export type ExportSnapshot = z.infer<typeof ExportSnapshotSchema>;
export type ExportStory = z.infer<typeof ExportStorySchema>;

type SerializableStory = ExportStory & {
  initialState: ReturnType<typeof createRuntime>;
  storageKey: string;
};

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function sanitizeStory(input: ExportStory): ExportStory {
  if (input.snapshot.sealedAt === null) {
    throw new AuthoringError("VALIDATION", "Standalone export requires a sealed snapshot");
  }

  const chapters: ReaderChapter[] = input.graph.chapters.map((chapter) =>
    ReaderChapterSchema.parse({
      id: chapter.id,
      ordinal: chapter.ordinal,
      title: chapter.title,
      summary: chapter.summary,
    }),
  );
  const nodes: ReaderStoryNode[] = input.graph.nodes.map((node) =>
    ReaderStoryNodeSchema.parse({
      id: node.id,
      chapterId: node.chapterId,
      nodeKey: node.nodeKey,
      kind: node.kind,
      title: node.title,
      body: node.body,
      summary: node.summary,
    }),
  );
  const edges: ReaderStoryEdge[] = input.graph.edges.map((edge) =>
    ReaderStoryEdgeSchema.parse({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      sortOrder: edge.sortOrder,
    }),
  );

  return ExportStorySchema.parse({
    snapshot: {
      id: input.snapshot.id,
      projectId: input.snapshot.projectId,
      versionNumber: input.snapshot.versionNumber,
      createdAt: input.snapshot.createdAt,
      sealedAt: input.snapshot.sealedAt,
    },
    graph: {
      versionId: input.graph.versionId,
      chapters,
      nodes,
      edges,
    },
  });
}

function renderShell(storyJson: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StoryForge Export</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f8f1df;
      --ink: #1e211a;
      --muted: #5f604f;
      --accent: #8f4d24;
      --panel: #fffaf0;
      --line: #d8c7a3;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(194, 113, 50, 0.2), transparent 32rem),
        linear-gradient(135deg, #f8f1df 0%, #eee0be 100%);
      color: var(--ink);
      font-family: Georgia, "Times New Roman", serif;
    }

    main {
      width: min(48rem, calc(100% - 2rem));
      margin: 0 auto;
      padding: 4rem 0;
    }

    article {
      background: rgba(255, 250, 240, 0.92);
      border: 1px solid var(--line);
      border-radius: 1.25rem;
      box-shadow: 0 1.5rem 4rem rgba(66, 43, 19, 0.16);
      padding: clamp(1.25rem, 4vw, 2.5rem);
    }

    .kicker,
    .status {
      color: var(--muted);
      font-family: "Courier New", monospace;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0.5rem 0 1rem;
      font-size: clamp(2rem, 8vw, 4rem);
      line-height: 0.95;
    }

    p {
      font-size: 1.16rem;
      line-height: 1.75;
      white-space: pre-wrap;
    }

    .choices,
    .controls {
      display: grid;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    button {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel);
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      padding: 0.85rem 1rem;
      text-align: left;
      transition: transform 140ms ease, border-color 140ms ease;
    }

    button:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    .controls {
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    }

    .controls button {
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <article>
      <div class="kicker" id="chapter"></div>
      <h1 id="title"></h1>
      <p id="body"></p>
      <div class="status" id="status"></div>
      <div class="choices" id="choices"></div>
      <div class="controls">
        <button type="button" data-action="back" id="back">Back</button>
        <button type="button" data-action="restart" id="restart">Restart</button>
      </div>
    </article>
  </main>
  <script id="story-data" type="application/json">${storyJson}</script>
  <script>
    const story = JSON.parse(document.getElementById("story-data").textContent);
    const nodesById = new Map(story.graph.nodes.map((node) => [node.id, node]));
    const chaptersById = new Map(story.graph.chapters.map((chapter) => [chapter.id, chapter]));
    const edgesBySourceId = new Map();

    for (const edge of story.graph.edges) {
      const edges = edgesBySourceId.get(edge.sourceNodeId) || [];
      edges.push(edge);
      edges.sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
      edgesBySourceId.set(edge.sourceNodeId, edges);
    }

    let state = loadState();

    function loadState() {
      try {
        const stored = localStorage.getItem(story.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (nodesById.has(parsed.currentNodeId)) {
            return parsed;
          }
        }
      } catch {
        return story.initialState;
      }

      return story.initialState;
    }

    function saveState() {
      localStorage.setItem(story.storageKey, JSON.stringify(state));
    }

    function currentNode() {
      const node = nodesById.get(state.currentNodeId);
      if (!node) {
        throw new Error("Current node is missing from the exported story.");
      }

      return node;
    }

    function render() {
      const node = currentNode();
      const chapter = chaptersById.get(node.chapterId);
      const choices = edgesBySourceId.get(node.id) || [];
      document.getElementById("chapter").textContent = chapter ? chapter.title : "";
      document.getElementById("title").textContent = node.title;
      document.getElementById("body").textContent = node.body;
      document.getElementById("status").textContent = state.isEnding ? "Ending reached" : "";
      document.getElementById("back").disabled = state.edgePath.length === 0;

      const choiceRoot = document.getElementById("choices");
      choiceRoot.replaceChildren();
      for (const edge of choices) {
        if (state.isEnding) {
          continue;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = edge.label;
        button.addEventListener("click", () => choose(edge.id));
        choiceRoot.appendChild(button);
      }
    }

    function choose(edgeId) {
      const edge = story.graph.edges.find((candidate) => candidate.id === edgeId);
      if (!edge || edge.sourceNodeId !== state.currentNodeId) {
        return;
      }

      const targetNode = nodesById.get(edge.targetNodeId);
      if (!targetNode) {
        return;
      }

      state = {
        currentNodeId: targetNode.id,
        nodePath: [...state.nodePath, targetNode.id],
        edgePath: [...state.edgePath, edge.id],
        isEnding: targetNode.kind === "ending",
      };
      saveState();
      render();
    }

    function restart() {
      state = story.initialState;
      saveState();
      render();
    }

    function back() {
      if (state.edgePath.length === 0) {
        return;
      }

      const nextEdgePath = state.edgePath.slice(0, -1);
      let nextState = story.initialState;
      for (const edgeId of nextEdgePath) {
        const edge = story.graph.edges.find((candidate) => candidate.id === edgeId);
        if (!edge) {
          break;
        }
        const targetNode = nodesById.get(edge.targetNodeId);
        if (!targetNode) {
          break;
        }
        nextState = {
          currentNodeId: targetNode.id,
          nodePath: [...nextState.nodePath, targetNode.id],
          edgePath: [...nextState.edgePath, edge.id],
          isEnding: targetNode.kind === "ending",
        };
      }

      state = nextState;
      saveState();
      render();
    }

    document.getElementById("restart").addEventListener("click", restart);
    document.getElementById("back").addEventListener("click", back);
    render();
  </script>
</body>
</html>`;
}

export function renderStandaloneHtml(input: ExportStory): string {
  const story = sanitizeStory(input);
  const initialState = createRuntime(story.graph);
  const payload: SerializableStory = {
    ...story,
    initialState,
    storageKey: `storyforge:${story.snapshot.projectId}:${story.snapshot.versionNumber}`,
  };

  return renderShell(escapeScriptJson(payload));
}
