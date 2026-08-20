"use client";

import Link from "next/link";
import { useState } from "react";
import type { Project, StoryGraph, StoryNode, ValidationIssue } from "@/lib/authoring/schemas";
import { initialEditorState } from "./editor-store";
import { OutlineTree } from "./outline-tree";

type EditorShellProps = {
  project: Project;
  graph: StoryGraph;
  issues: ValidationIssue[];
};

export function EditorShell({ project, graph, issues }: EditorShellProps) {
  const initial = initialEditorState(graph);
  const [selectedNodeId, setSelectedNodeId] = useState(initial.selectedNodeId);
  const [collapsedChapterIds, setCollapsedChapterIds] = useState(initial.collapsedChapterIds);
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const blockingIssues = issues.filter((issue) => issue.severity === "blocking");

  function toggleChapter(chapterId: string) {
    setCollapsedChapterIds((current) => current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId]);
  }

  return (
    <main className="editor-shell-page">
      <header className="editor-topbar">
        <div className="editor-project-lockup">
          <Link className="editor-back" href="/" aria-label="返回项目库">←</Link>
          <div><p className="eyebrow">EDIT / {project.id.slice(0, 8)}</p><h1>{project.title}</h1></div>
        </div>
        <div className="editor-top-actions">
          <span className="editor-save-state">本地草稿 · 修订 {project.activeDraftVersionId ? "可追踪" : "未初始化"}</span>
          <Link className="button button-small button-quiet" href={`/projects/${project.id}/generate`}>生成流程</Link>
          <Link className="button button-small button-primary" href={`/projects/${project.id}/preview`}>预览</Link>
        </div>
      </header>
      <div className="editor-workspace">
        <aside className="editor-sidebar editor-outline-panel">
          <div className="editor-panel-heading"><div><p className="eyebrow">OUTLINE</p><h2>故事大纲</h2></div><span>{graph.nodes.length} 节点</span></div>
          <OutlineTree graph={graph} selectedNodeId={selectedNodeId} collapsedChapterIds={collapsedChapterIds} onSelect={setSelectedNodeId} onToggleChapter={toggleChapter} />
        </aside>
        <section className="editor-main-panel" aria-label="节点编辑区域">
          {selectedNode ? (
            <NodeCanvas node={selectedNode} graph={graph} />
          ) : (
            <div className="editor-empty-node">从左侧大纲选择一个节点开始。</div>
          )}
        </section>
        <aside className="editor-sidebar editor-inspector-panel">
          <p className="eyebrow">INSPECTOR</p>
          <h2>项目状态</h2>
          <div className="inspector-stat"><span>结构节点</span><strong>{graph.nodes.length} / {project.targetNodeCount}</strong></div>
          <div className="inspector-stat"><span>结局数量</span><strong>{graph.nodes.filter((node) => node.kind === "ending").length} / {project.targetEndingCount}</strong></div>
          <div className={`inspector-issue ${blockingIssues.length > 0 ? "inspector-issue-warning" : ""}`}><strong>{blockingIssues.length}</strong><span>个阻断问题</span></div>
          <div className="inspector-divider" />
          <p className="eyebrow">SELECTED NODE</p>
          {selectedNode ? <><h3>{selectedNode.title}</h3><p className="inspector-muted">{selectedNode.contentStatus === "author_edited" ? "该节点包含人工修改，生成器不会自动覆盖。" : "节点内容将在后续编辑步骤中开放。"}</p></> : <p className="inspector-muted">尚未选择节点。</p>}
        </aside>
      </div>
    </main>
  );
}

function NodeCanvas({ node, graph }: { node: StoryNode; graph: StoryGraph }) {
  const outgoing = graph.edges.filter((edge) => edge.sourceNodeId === node.id).sort((left, right) => left.sortOrder - right.sortOrder);
  return (
    <article className="node-canvas">
      <div className="node-canvas-kicker"><span className="eyebrow">NODE / {node.nodeKey}</span><span className={`content-status content-status-${node.contentStatus}`}>{node.contentStatus === "author_edited" ? "已改写" : node.contentStatus === "generated" ? "已生成" : node.contentStatus === "review_required" ? "需审阅" : "待生成"}</span></div>
      <h2>{node.title}</h2>
      <p className="node-canvas-objective">{node.objective}</p>
      <div className="node-canvas-copy"><p>{node.body}</p></div>
      <div className="node-choices"><p className="eyebrow">CHOICES / {outgoing.length}</p>{outgoing.map((edge) => <div className="node-choice" key={edge.id}><strong>{edge.label}</strong><span>{edge.consequenceSummary}</span></div>)}</div>
    </article>
  );
}
