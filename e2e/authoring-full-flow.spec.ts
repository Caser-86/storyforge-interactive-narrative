import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanAuthoringDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${SQLITE_E2E_PATH}${suffix}`, { force: true });
  }
}

test.describe("full author-driven authoring flow", () => {
  test.beforeEach(() => cleanAuthoringDatabase());
  test.afterEach(() => cleanAuthoringDatabase());

  test("creates, chooses, closes, materializes, validates, and snapshots one story", async ({ page, request }) => {
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "正式作者闭环测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制紧张",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string };

    await page.goto(`/projects/${project.id}/generate`);
    await expect(page.getByRole("button", { name: "开始分支写作" })).toBeVisible();
    await expect(page.getByText("一次性结构化生成")).toBeVisible();
    await page.getByRole("button", { name: "开始分支写作" }).click();

    const stage = page.locator(".interactive-stage");
    await expect(stage.getByText("第 1 / 6 幕")).toBeVisible();
    await expect(stage.locator(".interactive-choice")).toHaveCount(3);

    await page.getByRole("button", { name: "改道前进" }).click();
    for (let turn = 2; turn <= 5; turn += 1) {
      await expect(stage.getByText(`第 ${turn} / 6 幕`)).toBeVisible();
      await expect(stage.locator(".interactive-choice")).toHaveCount(3);
      await page.getByRole("button", { name: "继续调查" }).click();
    }

    await expect(stage.getByText("第 6 / 6 幕")).toBeVisible();
    await expect(page.getByText("故事已结束")).toBeVisible();
    await expect(stage.locator(".interactive-choice")).toHaveCount(0);

    await page.getByRole("button", { name: "保存为正式故事草稿" }).click();
    await expect(page.getByText("已保存为正式故事草稿")).toBeVisible();
    await page.getByRole("link", { name: "进入编辑器" }).click();

    const initialGraphResponse = await request.get(`/api/projects/${project.id}/graph`);
    expect(initialGraphResponse.ok()).toBe(true);
    const initialGraph = (await initialGraphResponse.json()).graph as {
      versionId: string;
      nodes: Array<{ kind: string }>;
      edges: Array<{ label: string; branchType: string }>;
    };
    const savedProject = (await (await request.get(`/api/projects/${project.id}`)).json()).project as { activeDraftVersionId: string };
    expect(initialGraph.versionId).toBe(savedProject.activeDraftVersionId);
    expect(initialGraph.nodes).toHaveLength(6);
    expect(initialGraph.nodes[0]?.kind).toBe("start");
    expect(initialGraph.nodes.at(-1)?.kind).toBe("ending");
    expect(initialGraph.edges[0]?.label).toBe("改道前进");
    expect(initialGraph.edges.every((edge) => edge.branchType === "main")).toBe(true);

    const nodeButtons = page.locator("button.outline-node-button");
    await expect(nodeButtons).toHaveCount(6);
    await nodeButtons.nth(4).click();
    const endingEditor = page.getByRole("region", { name: "新增作者结局" });
    await endingEditor.getByLabel("结局选择文案", { exact: true }).fill("打开最后一盏灯");
    await endingEditor.getByLabel("结局标题", { exact: true }).fill("新的黎明");
    await endingEditor.getByLabel("结局正文", { exact: true }).fill("档案室迎来新的黎明。");
    await endingEditor.getByLabel("结局摘要", { exact: true }).fill("作者为档案室保留了新的未来。");
    await endingEditor.getByLabel("结局目标", { exact: true }).fill("为档案室保留未来。");
    await endingEditor.getByRole("button", { name: "保存作者结局" }).click();
    await expect(page.getByText("已保存作者结局，已切换到新节点。")).toBeVisible();

    const graph = (await (await request.get(`/api/projects/${project.id}/graph`)).json()).graph as {
      nodes: Array<{ kind: string; title: string }>;
      edges: Array<{ label: string }>;
    };
    expect(graph.nodes).toHaveLength(7);
    expect(graph.nodes.filter((node) => node.kind === "ending")).toHaveLength(2);
    expect(graph.nodes.some((node) => node.title === "新的黎明")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "打开最后一盏灯")).toBe(true);

    await page.locator("button.outline-node-button").nth(3).click();
    const branchEditor = page.getByRole("region", { name: "新增作者分支" });
    await branchEditor.getByLabel("选择文案", { exact: true }).fill("穿过淹水的长廊");
    await branchEditor.getByLabel("新节点标题", { exact: true }).fill("淹水长廊");
    await branchEditor.getByLabel("新节点正文", { exact: true }).fill("水位沿着长廊台阶缓慢上涨。");
    await branchEditor.getByLabel("新节点摘要", { exact: true }).fill("档案员找到一条通往出口的路线。");
    await branchEditor.getByLabel("新节点目标", { exact: true }).fill("找到安全的返回路线。");
    await branchEditor.getByRole("button", { name: "保存作者分支" }).click();
    await expect(page.getByText("已保存作者分支，已切换到新节点。")).toBeVisible();

    const validation = await request.post(`/api/projects/${project.id}/validate`, { data: { sources: ["structural", "rule"] } });
    expect(validation.ok()).toBe(true);
    const completedGraph = (await (await request.get(`/api/projects/${project.id}/graph`)).json()).graph as {
      nodes: Array<{ kind: string; title: string }>;
      edges: Array<{ label: string }>;
    };
    expect(completedGraph.nodes).toHaveLength(8);
    expect(completedGraph.nodes.filter((node) => node.kind === "ending")).toHaveLength(2);
    expect(completedGraph.nodes.some((node) => node.title === "淹水长廊")).toBe(true);
    expect(completedGraph.edges.some((edge) => edge.label === "穿过淹水的长廊")).toBe(true);
    const snapshot = await request.post(`/api/projects/${project.id}/snapshots`);
    expect(snapshot.status()).toBe(201);
  });
});
