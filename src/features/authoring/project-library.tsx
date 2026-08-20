"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectSummary } from "@/lib/authoring/repository";

type ProjectLibraryProps = {
  projects: ProjectSummary[];
  initialError?: string;
};

type ActionState = {
  projectId: string;
  label: string;
} | null;

const statusLabels: Record<ProjectSummary["status"], string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "可编辑",
  archived: "已归档",
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新时间未知";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `操作失败（${response.status}）`;
  } catch {
    return `操作失败（${response.status}）`;
  }
}

export function ProjectLibrary({ projects, initialError }: ProjectLibraryProps) {
  const [actionState, setActionState] = useState<ActionState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(project: ProjectSummary, action: "duplicate" | "archive" | "delete") {
    if (action === "delete" && !window.confirm(`确定删除“${project.title}”吗？此操作无法撤销。`)) {
      return;
    }

    const labels = { duplicate: "复制中", archive: "归档中", delete: "删除中" };
    setActionState({ projectId: project.id, label: labels[action] });
    setActionError(null);

    try {
      const response = await fetch(
        action === "duplicate" ? `/api/projects/${project.id}/duplicate` : `/api/projects/${project.id}`,
        {
          method: action === "duplicate" ? "POST" : action === "archive" ? "PATCH" : "DELETE",
          ...(action === "archive"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "archived" }),
              }
            : {}),
        },
      );

      if (!response.ok) throw new Error(await readError(response));
      window.location.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败，请稍后重试");
      setActionState(null);
    }
  }

  return (
    <main className="authoring-shell">
      <div className="authoring-grain" aria-hidden="true" />
      <div className="authoring-container">
        <header className="authoring-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">SF</span>
            <div>
              <p className="eyebrow">STORYFORGE / AUTHORING DESK</p>
              <p className="brand-name">故事工作台</p>
            </div>
          </div>
          <div className="header-note">私人创作空间 · 本地数据</div>
        </header>

        <section className="library-intro" aria-labelledby="project-library-title">
          <div>
            <p className="eyebrow">PROJECT INDEX / 01</p>
            <h1 id="project-library-title">项目库</h1>
            <p className="library-lede">从一句设定开始，逐步整理成一部可以反复打磨的互动叙事作品。</p>
          </div>
          <Link className="button button-primary" href="/projects/new">
            新建项目 <span aria-hidden="true">↗</span>
          </Link>
        </section>

        {initialError ? (
          <div className="library-alert" role="alert">
            <strong>项目库暂时无法读取</strong>
            <span>{initialError}</span>
          </div>
        ) : null}
        {actionError ? (
          <div className="library-alert" role="alert">
            <strong>操作未完成</strong>
            <span>{actionError}</span>
          </div>
        ) : null}

        {projects.length === 0 ? (
          <section className="empty-library" aria-label="空项目库">
            <span className="empty-index">NO. 00</span>
            <div>
              <h2>还没有项目</h2>
              <p>先建立一份项目简报，后续的世界观、节点和结局都会围绕它展开。</p>
            </div>
            <Link className="text-link" href="/projects/new">开始第一份简报 <span aria-hidden="true">→</span></Link>
          </section>
        ) : (
          <section className="project-grid" aria-label="项目列表">
            {projects.map((project, index) => {
              const isBusy = actionState?.projectId === project.id;
              return (
                <article className="project-card" key={project.id}>
                  <div className="project-card-topline">
                    <span className="project-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`status status-${project.status}`}>{statusLabels[project.status]}</span>
                  </div>
                  <div className="project-card-body">
                    <p className="project-genre">{project.genre} · {project.rating}</p>
                    <h2>{project.title}</h2>
                    <p className="project-premise">{project.premise}</p>
                  </div>
                  <div className="project-metrics">
                    <span aria-label={`${project.targetNodeCount} 个节点`}><strong>{project.targetNodeCount}</strong> 个节点</span>
                    <span aria-label={`${project.targetEndingCount} 个结局`}><strong>{project.targetEndingCount}</strong> 个结局</span>
                    <span
                      aria-label={`${project.blockingIssueCount} 个阻断问题`}
                      className={project.blockingIssueCount > 0 ? "metric-warning" : ""}
                    >
                      <strong>{project.blockingIssueCount}</strong> 个阻断问题
                    </span>
                  </div>
                  <div className="project-card-footer">
                    <span className="updated-at">更新于 {formatUpdatedAt(project.updatedAt)}</span>
                    <div className="project-actions">
                      <Link className="button button-small button-primary" href={`/projects/${project.id}/edit`}>
                        打开项目 <span aria-hidden="true">→</span>
                      </Link>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`复制${project.title}`}
                        disabled={isBusy}
                        onClick={() => void runAction(project, "duplicate")}
                      >
                        {isBusy && actionState?.label === "复制中" ? "…" : "复制"}
                      </button>
                      {project.status !== "archived" ? (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`归档${project.title}`}
                          disabled={isBusy}
                          onClick={() => void runAction(project, "archive")}
                        >
                          {isBusy && actionState?.label === "归档中" ? "…" : "归档"}
                        </button>
                      ) : null}
                      <button
                        className="icon-button icon-button-danger"
                        type="button"
                        aria-label={`删除${project.title}`}
                        disabled={isBusy}
                        onClick={() => void runAction(project, "delete")}
                      >
                        {isBusy && actionState?.label === "删除中" ? "…" : "删除"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <footer className="authoring-footer">
          <span>结构化创作 · 可回溯版本 · 不自动覆盖人工编辑</span>
          <span>{projects.length} 个项目</span>
        </footer>
      </div>
    </main>
  );
}
