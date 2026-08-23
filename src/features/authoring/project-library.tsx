"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectSummary["status"] | "all">("all");
  const importInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProjects = projects.filter((project) => {
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const searchableText = `${project.title} ${project.genre} ${project.premise}`.toLocaleLowerCase();
    return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });

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

  async function downloadBackup(project: ProjectSummary) {
    setActionState({ projectId: project.id, label: "备份中" });
    setActionError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}/backup`);
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `storyforge-project-${project.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "备份失败，请稍后重试");
    } finally {
      setActionState(null);
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setActionError(null);

    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backup, mode: "new-id" }),
      });
      if (!response.ok) throw new Error(await readError(response));
      window.location.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "导入失败，请检查备份文件");
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
          <label className="button button-quiet">
            导入备份
            <input
              ref={importInputRef}
              aria-label="导入 StoryForge 项目备份"
              accept="application/json,.json"
              className="backup-file-input"
              type="file"
              onChange={(event) => void importBackup(event)}
            />
          </label>
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

        {projects.length > 0 ? (
          <section className="library-filters" aria-label="项目筛选">
            <label className="library-filter-field" htmlFor="project-search">
              <span>筛选项目</span>
              <input
                id="project-search"
                aria-label="筛选项目"
                value={query}
                placeholder="搜索标题、类型或简介"
                type="search"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="library-filter-field" htmlFor="project-status-filter">
              <span>项目状态</span>
              <select
                id="project-status-filter"
                aria-label="项目状态"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ProjectSummary["status"] | "all")}
              >
                <option value="all">全部状态</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <span className="library-filter-count">显示 {visibleProjects.length} / {projects.length}</span>
          </section>
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
        ) : visibleProjects.length === 0 ? (
          <section className="empty-library" aria-label="没有匹配的项目">
            <span className="empty-index">NO. 00</span>
            <div>
              <h2>没有匹配项目</h2>
              <p>换一个关键词或状态筛选，项目仍会保留在本地项目库中。</p>
            </div>
            <button className="text-link" type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>
              清除筛选 <span aria-hidden="true">↗</span>
            </button>
          </section>
        ) : (
          <section className="project-grid" aria-label="项目列表">
            {visibleProjects.map((project, index) => {
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
                        aria-label={`备份${project.title}`}
                        disabled={isBusy}
                        onClick={() => void downloadBackup(project)}
                      >
                        {isBusy && actionState?.label === "备份中" ? "…" : "备份"}
                      </button>
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
          <span>{visibleProjects.length} / {projects.length} 个项目</span>
        </footer>
      </div>
    </main>
  );
}
