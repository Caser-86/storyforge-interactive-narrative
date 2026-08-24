import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanAuthoringDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${SQLITE_E2E_PATH}${suffix}`, { force: true });
  }
}

test.describe("interactive authoring flow", () => {
  test.beforeEach(() => cleanAuthoringDatabase());
  test.afterEach(() => cleanAuthoringDatabase());

  test("creates, resumes, and completes a bounded choice-driven story", async ({ page, request }) => {
    page.on("dialog", (dialog) => dialog.accept());
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "分支写作闭环测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制紧张",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "short", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string };

    await page.goto(`/projects/${project.id}/play`);
    await page.getByRole("button", { name: "开始分支写作" }).click();
    await expect(page.getByRole("heading", { name: "第 1 幕" })).toBeVisible();
    const stage = page.locator(".interactive-stage");
    await expect(stage.getByText("第 1 / 8 幕")).toBeVisible();

    await page.getByRole("button", { name: "继续调查" }).click();
    await expect(stage.getByText("第 2 / 8 幕")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "第 2 幕" })).toBeVisible();

    for (let turn = 2; turn < 8; turn += 1) {
      await page.getByRole("button", { name: "继续调查" }).click();
      await expect(stage.getByText(`第 ${turn + 1} / 8 幕`)).toBeVisible();
    }

    await expect(page.getByText("故事已结束")).toBeVisible();
    await expect(page.getByText("本次互动已经收束。")).toBeVisible();
    await page.getByRole("button", { name: "保存为正式故事草稿" }).click();
    await expect(page.getByText("已保存为正式故事草稿")).toBeVisible();
    await expect(page.getByRole("link", { name: "进入编辑器" })).toHaveAttribute("href", `/projects/${project.id}/edit`);
    const savedProjectResponse = await request.get(`/api/projects/${project.id}`);
    const savedProject = (await savedProjectResponse.json()).project as { activeDraftVersionId: string };
    const savedGraphResponse = await request.get(`/api/projects/${project.id}/graph`);
    const savedGraph = (await savedGraphResponse.json()).graph as { versionId: string; nodes: Array<{ kind: string }>; edges: Array<{ branchType: string }> };
    expect(savedGraph.versionId).toBe(savedProject.activeDraftVersionId);
    expect(savedGraph.nodes).toHaveLength(8);
    expect(savedGraph.nodes[0]?.kind).toBe("start");
    expect(savedGraph.nodes.at(-1)?.kind).toBe("ending");
    expect(savedGraph.edges.every((edge) => edge.branchType === "main")).toBe(true);
    await page.reload();
    await expect(page.getByText("已保存为正式故事草稿")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新开始" })).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复分支写作闭环测试第 8 幕" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "导出 Markdown" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-interactive\.md$/);

    await page.getByRole("button", { name: "删除分支写作闭环测试第 8 幕" }).click();
    await expect(page.getByRole("button", { name: "恢复分支写作闭环测试第 8 幕" })).not.toBeVisible();
  });
});
