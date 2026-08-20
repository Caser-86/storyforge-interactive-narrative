"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { chooseEdge, createRuntime } from "@/lib/authoring/runtime";
import type { ReaderStoryNode, StoryRuntimeState } from "@/lib/authoring/runtime";
import type { PreviewResponse } from "@/lib/authoring/preview-contracts";
import { createPreviewSnapshot, loadPreview } from "./authoring-api";

type PreviewPlayerProps = {
  projectId: string;
  projectTitle: string;
  initialSnapshotId: string | null;
};

export function PreviewPlayer({ projectId, projectTitle, initialSnapshotId }: PreviewPlayerProps) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [runtime, setRuntime] = useState<StoryRuntimeState | null>(null);
  const [isBusy, setIsBusy] = useState(initialSnapshotId !== null);
  const [error, setError] = useState<string | null>(null);

  const openPreview = useCallback(async (snapshotId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const loaded = await loadPreview(projectId, snapshotId);
      setPreview(loaded);
      setRuntime(loaded.runtime);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "预览加载失败");
    } finally {
      setIsBusy(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!initialSnapshotId) return;
    let canceled = false;
    void loadPreview(projectId, initialSnapshotId)
      .then((loaded) => {
        if (canceled) return;
        setPreview(loaded);
        setRuntime(loaded.runtime);
        setIsBusy(false);
      })
      .catch((loadError) => {
        if (canceled) return;
        setError(loadError instanceof Error ? loadError.message : "预览加载失败");
        setIsBusy(false);
      });
    return () => {
      canceled = true;
    };
  }, [initialSnapshotId, projectId]);

  async function publishAndPreview() {
    setIsBusy(true);
    setError(null);
    try {
      const snapshot = await createPreviewSnapshot(projectId);
      await openPreview(snapshot.id);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "无法创建预览快照");
      setIsBusy(false);
    }
  }

  function choose(edgeId: string) {
    if (!preview || !runtime) return;
    try {
      setRuntime(chooseEdge(preview.graph, runtime, edgeId));
    } catch (choiceError) {
      setError(choiceError instanceof Error ? choiceError.message : "选项不可用");
    }
  }

  if (isBusy && !preview) return <PreviewFrame projectTitle={projectTitle}><p className="preview-loading">正在加载只读预览…</p></PreviewFrame>;

  if (!preview || !runtime) {
    return (
      <PreviewFrame projectTitle={projectTitle}>
        <div className="preview-empty">
          <p className="eyebrow">RELEASE PREVIEW</p>
          <h2>还没有可运行的发布快照</h2>
          <p>预览只运行通过结构校验的不可变快照。封存当前草稿后，所有分支选择都会在本地闭环到结局。</p>
          {error ? <p className="preview-error" role="alert">{error}</p> : null}
          <div className="preview-actions"><button className="button button-primary" type="button" disabled={isBusy} onClick={() => void publishAndPreview()}>{isBusy ? "封存中…" : "封存当前草稿并预览"}</button><Link className="button button-small button-quiet" href={`/projects/${projectId}/edit`}>返回编辑器</Link></div>
        </div>
      </PreviewFrame>
    );
  }

  const node = preview.graph.nodes.find((candidate) => candidate.id === runtime.currentNodeId);
  const choices = preview.graph.edges.filter((edge) => edge.sourceNodeId === runtime.currentNodeId).sort((left, right) => left.sortOrder - right.sortOrder);
  if (!node) return <PreviewFrame projectTitle={projectTitle}><p className="preview-error" role="alert">当前节点不存在，无法继续预览。</p></PreviewFrame>;

  return (
    <PreviewFrame projectTitle={projectTitle}>
      <div className="preview-reader-topline"><span className="eyebrow">SNAPSHOT V{preview.snapshot.versionNumber}</span><span>{runtime.nodePath.length} 次选择</span></div>
      <PreviewNode node={node} isEnding={runtime.isEnding} />
      {error ? <p className="preview-error" role="alert">{error}</p> : null}
      {runtime.isEnding ? <div className="preview-ending"><strong>故事到达结局</strong><button className="button button-small button-quiet" type="button" onClick={() => setRuntime(createRuntime(preview.graph))}>重新开始</button></div> : <div className="preview-choices"><p className="eyebrow">选择下一步</p>{choices.map((edge) => <button className="preview-choice" key={edge.id} type="button" onClick={() => choose(edge.id)}><strong>{edge.label}</strong><span>{preview.graph.nodes.find((candidate) => candidate.id === edge.targetNodeId)?.title ?? "继续"}</span></button>)}</div>}
      <div className="preview-footer-actions"><Link className="text-link" href={`/projects/${projectId}/edit`}>返回编辑器</Link><button className="icon-button" type="button" disabled={isBusy} onClick={() => void publishAndPreview()}>封存新版本</button><a className="text-link" href={`/api/projects/${projectId}/export/html?snapshotId=${preview.snapshot.id}`}>导出 HTML</a></div>
    </PreviewFrame>
  );
}

function PreviewFrame({ projectTitle, children }: { projectTitle: string; children: React.ReactNode }) {
  return <main className="preview-page"><header className="preview-header"><div className="brand-lockup"><span className="brand-mark" aria-hidden="true">SF</span><div><p className="eyebrow">AUTHORING DESK / PREVIEW</p><p className="brand-name">{projectTitle}</p></div></div><span className="preview-readonly">只读运行</span></header><section className="preview-stage">{children}</section></main>;
}

function PreviewNode({ node, isEnding }: { node: ReaderStoryNode; isEnding: boolean }) {
  return <article className={`preview-node ${isEnding ? "preview-node-ending" : ""}`}><p className="eyebrow">{isEnding ? "ENDING" : node.kind === "start" ? "OPENING" : "SCENE"}</p><h1>{node.title}</h1><div className="preview-body">{node.body.split(/\n\s*\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><p className="preview-summary">{node.summary}</p></article>;
}
