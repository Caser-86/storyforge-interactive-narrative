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
         size: { preset: "short", targetNodes: 15, targetEndings: 2 },
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

  test("turns an interactive path into a releasable story after adding a second ending", async ({ page, request }) => {
    page.on("dialog", (dialog) => dialog.accept());
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "互动落稿正式发布测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制紧张",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "short", targetNodes: 15, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string };

    await page.goto(`/projects/${project.id}/play`);
    await page.getByRole("button", { name: "开始分支写作" }).click();
    await expect(page.getByRole("heading", { name: "第 1 幕" })).toBeVisible();
    for (let turn = 1; turn < 8; turn += 1) {
      await page.getByRole("button", { name: "继续调查" }).click();
      await expect(page.getByRole("heading", { name: `第 ${turn + 1} 幕` })).toBeVisible();
    }

    await expect(page.getByText("故事已结束")).toBeVisible();
    await page.getByRole("button", { name: "保存为正式故事草稿" }).click();
    await expect(page.getByText("已保存为正式故事草稿")).toBeVisible();
    await page.getByRole("link", { name: "进入编辑器" }).click();

    const nodeButtons = page.locator("button.outline-node-button");
    await expect(nodeButtons).toHaveCount(8);
    await nodeButtons.nth(6).click();
    const endingEditor = page.getByRole("region", { name: "新增作者结局" });
    await expect(endingEditor.getByRole("heading", { name: "新增作者结局" })).toBeVisible();
    await endingEditor.getByLabel("结局选择文案", { exact: true }).fill("Open the final lantern");
    await endingEditor.getByLabel("结局标题", { exact: true }).fill("A New Dawn");
    await endingEditor.getByLabel("结局正文", { exact: true }).fill("The final lantern opens.");
    await endingEditor.getByLabel("结局摘要", { exact: true }).fill("The archive finds a new future.");
    await endingEditor.getByLabel("结局目标", { exact: true }).fill("Give the archive a future.");

    const endingWrite = page.waitForResponse((response) => response.url().includes(`/api/projects/${project.id}/graph`) && response.request().method() === "PUT");
    await endingEditor.getByRole("button", { name: "保存作者结局" }).click();
    expect((await endingWrite).ok()).toBe(true);
    await expect(page.getByText("已保存作者结局，已切换到新节点。")).toBeVisible();

    const persisted = (await (await request.get(`/api/projects/${project.id}/graph`)).json()).graph as { nodes: Array<{ kind: string; title: string }>; edges: Array<{ label: string }> };
    expect(persisted.nodes).toHaveLength(9);
    expect(persisted.nodes.filter((node) => node.kind === "ending")).toHaveLength(2);
    expect(persisted.nodes.some((node) => node.title === "A New Dawn")).toBe(true);
    expect(persisted.edges.some((edge) => edge.label === "Open the final lantern")).toBe(true);

    const validation = await request.post(`/api/projects/${project.id}/validate`, { data: { sources: ["structural", "rule"] } });
    expect(validation.ok()).toBe(true);
    const snapshot = await request.post(`/api/projects/${project.id}/snapshots`);
    expect(snapshot.status()).toBe(201);
  });
});
