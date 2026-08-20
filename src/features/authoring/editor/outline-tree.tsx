"use client";

import type { KeyboardEvent } from "react";
import { useMemo } from "react";
import type { StoryGraph, StoryNode } from "@/lib/authoring/schemas";

type OutlineTreeProps = {
  graph: StoryGraph;
  selectedNodeId: string | null;
  collapsedChapterIds: string[];
  onSelect: (nodeId: string) => void;
  onToggleChapter: (chapterId: string) => void;
};

type OutlineEntry =
  | { type: "node"; node: StoryNode; depth: number; edgeLabel?: string }
  | { type: "reference"; node: StoryNode; depth: number; edgeLabel?: string };

const contentStatusLabels: Record<StoryNode["contentStatus"], string> = {
  planned: "待生成",
  generated: "已生成",
  author_edited: "已改写",
  review_required: "需审阅",
};

function orderedNodes(graph: StoryGraph): StoryNode[] {
  return [...graph.nodes].sort((left, right) => left.topologicalRank - right.topologicalRank || left.nodeKey.localeCompare(right.nodeKey));
}

function buildChapterEntries(graph: StoryGraph, chapterId: string): OutlineEntry[] {
  const nodes = orderedNodes(graph).filter((node) => node.chapterId === chapterId);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    if (!nodeById.has(edge.sourceNodeId) || !nodeById.has(edge.targetNodeId)) continue;
    const edges = outgoing.get(edge.sourceNodeId) ?? [];
    edges.push(edge);
    outgoing.set(edge.sourceNodeId, edges);
  }
  for (const edges of outgoing.values()) edges.sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  const roots = nodes.filter((node) => node.kind === "start" || !graph.edges.some((edge) => edge.targetNodeId === node.id && nodeById.has(edge.sourceNodeId)));
  const entries: OutlineEntry[] = [];
  const visited = new Set<string>();

  function visit(node: StoryNode, depth: number, edgeLabel?: string) {
    if (visited.has(node.id)) {
      entries.push({ type: "reference", node, depth, edgeLabel });
      return;
    }

    visited.add(node.id);
    entries.push({ type: "node", node, depth, edgeLabel });
    for (const edge of outgoing.get(node.id) ?? []) {
      const target = nodeById.get(edge.targetNodeId);
      if (target) visit(target, depth + 1, edge.label);
    }
  }

  for (const root of roots) visit(root, 0);
  for (const node of nodes) if (!visited.has(node.id)) visit(node, 0);
  return entries;
}

function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, nodeIds: string[], nodeId: string, onSelect: (nodeId: string) => void) {
  const index = nodeIds.indexOf(nodeId);
  if (event.key === "ArrowDown" && index < nodeIds.length - 1) {
    event.preventDefault();
    onSelect(nodeIds[index + 1]!);
  }
  if (event.key === "ArrowUp" && index > 0) {
    event.preventDefault();
    onSelect(nodeIds[index - 1]!);
  }
}

export function OutlineTree({ graph, selectedNodeId, collapsedChapterIds, onSelect, onToggleChapter }: OutlineTreeProps) {
  const chapters = [...graph.chapters].sort((left, right) => left.ordinal - right.ordinal);
  const entriesByChapter = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, buildChapterEntries(graph, chapter.id)])),
    [chapters, graph],
  );
  const nodeIds = orderedNodes(graph).map((node) => node.id);

  return (
    <div className="outline-tree" role="tree" aria-label="故事大纲">
      {chapters.map((chapter) => {
        const collapsed = collapsedChapterIds.includes(chapter.id);
        const entries = entriesByChapter.get(chapter.id) ?? [];
        return (
          <section className="outline-chapter" key={chapter.id}>
            <button className="outline-chapter-toggle" type="button" onClick={() => onToggleChapter(chapter.id)} aria-expanded={!collapsed}>
              <span className="outline-chapter-number">CH {String(chapter.ordinal + 1).padStart(2, "0")}</span>
              <strong>{chapter.title}</strong>
              <span aria-hidden="true">{collapsed ? "+" : "−"}</span>
            </button>
            {!collapsed ? (
              <div className="outline-chapter-entries">
                {entries.map((entry, index) => {
                  if (entry.type === "reference") {
                    return (
                      <div className="outline-reference" data-depth={entry.depth} key={`reference-${entry.node.id}-${index}`}>
                        <span aria-hidden="true">↳</span>
                        <span>{entry.edgeLabel ?? "分支"} · 汇合至 {entry.node.title}</span>
                      </div>
                    );
                  }

                  return (
                    <div className="outline-node-row" data-depth={entry.depth} key={entry.node.id} role="treeitem" aria-level={entry.depth + 2} aria-selected={selectedNodeId === entry.node.id}>
                      <button
                        className={`outline-node-button ${selectedNodeId === entry.node.id ? "outline-node-selected" : ""}`}
                        type="button"
                        aria-label={`${entry.node.title}，${contentStatusLabels[entry.node.contentStatus]}`}
                        aria-current={selectedNodeId === entry.node.id ? "true" : undefined}
                        tabIndex={selectedNodeId === entry.node.id ? 0 : -1}
                        onClick={() => onSelect(entry.node.id)}
                        onKeyDown={(event) => handleNodeKeyDown(event, nodeIds, entry.node.id, onSelect)}
                      >
                        <span className={`node-kind node-kind-${entry.node.kind}`} aria-hidden="true">{entry.node.kind === "start" ? "S" : entry.node.kind === "ending" ? "E" : "N"}</span>
                        <span className="outline-node-copy"><strong>{entry.node.title}</strong><small>{entry.node.nodeKey}</small></span>
                        <span className={`content-status content-status-${entry.node.contentStatus}`}>{contentStatusLabels[entry.node.contentStatus]}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
