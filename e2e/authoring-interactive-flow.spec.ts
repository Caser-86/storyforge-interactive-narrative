import Database from "better-sqlite3";
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

    await page.goto(`/projects/${project.id}/generate`);
    await page.getByRole("button", { name: "开始分支写作" }).click();
    await expect(page.getByRole("heading", { name: "第 1 幕" })).toBeVisible();
    const stage = page.locator(".interactive-stage");
    await expect(stage.getByText("第 1 / 8 幕")).toBeVisible();
    await expect(stage.getByText("你正在亲自推进一条分支：每次只生成当前选择的下一幕，未选择的方向不会生成；达到计划幕数后由模型收尾。")).toBeVisible();
    await expect(stage.getByText("当前剧情锚点")).toBeVisible();
    await expect(stage.getByText("地点：当前场景")).toBeVisible();

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

    await page.goto(`/projects/${project.id}/generate`);
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
    await endingEditor.getByLabel("结局方向（可选）", { exact: true }).fill("公开真相，但保留一个有代价的希望。");
    await endingEditor.getByRole("button", { name: "让大模型生成结局" }).click();
    await expect(endingEditor.getByRole("article", { name: "结局预览" })).toBeVisible();
    await expect(endingEditor.getByText("模型仅生成预览")).toBeVisible();

    const endingWrite = page.waitForResponse((response) => response.url().includes(`/api/projects/${project.id}/graph`) && response.request().method() === "PUT");
    await endingEditor.getByRole("button", { name: "采用并保存" }).click();
    expect((await endingWrite).ok()).toBe(true);
    await expect(page.getByText("已保存作者结局，已切换到新节点。")).toBeVisible();

    const persisted = (await (await request.get(`/api/projects/${project.id}/graph`)).json()).graph as { nodes: Array<{ kind: string; title: string }>; edges: Array<{ label: string }> };
    expect(persisted.nodes).toHaveLength(9);
    expect(persisted.nodes.filter((node) => node.kind === "ending")).toHaveLength(2);
    expect(persisted.nodes.some((node) => node.title.endsWith("：最后的回声"))).toBe(true);
    expect(persisted.edges.some((edge) => edge.label === "沿着潮声寻找最后的答案")).toBe(true);

    const validation = await request.post(`/api/projects/${project.id}/validate`, { data: { sources: ["structural", "rule"] } });
    expect(validation.ok()).toBe(true);
    const snapshot = await request.post(`/api/projects/${project.id}/snapshots`, { headers: { "x-storyforge-cli": "1" } });
    expect(snapshot.status()).toBe(201);
  });

  test("recovers a legacy active scene with no choices without changing the source record", async ({ page, request }) => {
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "旧会话浏览器恢复测试",
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

    const startedResponse = await request.post(`/api/projects/${project.id}/play`);
    expect(startedResponse.status()).toBe(202);
    const started = (await startedResponse.json()).session as { id: string };
    let activeSession: { id: string; status: string; turn: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request.get(`/api/projects/${project.id}/play/${started.id}`);
      expect(response.ok()).toBe(true);
      const session = (await response.json()).session as { id: string; status: string; turn: number };
      if (session.status === "active") {
        activeSession = session;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(activeSession).not.toBeNull();

    const database = new Database(SQLITE_E2E_PATH);
    try {
      database.pragma("busy_timeout = 5000");
      const row = database.prepare("SELECT scene_json FROM interactive_turns WHERE session_id = ? ORDER BY turn DESC LIMIT 1").get(activeSession!.id) as { scene_json: string } | undefined;
      expect(row).toBeDefined();
      const scene = JSON.parse(row!.scene_json) as { choices: unknown[] };
      database.prepare("UPDATE interactive_turns SET scene_json = ? WHERE session_id = ? AND turn = 1").run(JSON.stringify({ ...scene, choices: [] }), activeSession!.id);
    } finally {
      database.close();
    }

    await page.goto(`/projects/${project.id}/generate?sessionId=${encodeURIComponent(activeSession!.id)}`);
    const stage = page.locator(".interactive-stage");
    const legacyNotice = stage.locator(".interactive-legacy-notice");
    await expect(legacyNotice).toContainText("这条旧记录无法继续");
    await expect(legacyNotice).toContainText("没有可选择的分支");
    await expect(stage.getByRole("button", { name: "新建分支写作" })).toBeVisible();
    await expect(stage.locator(".interactive-choices")).toHaveCount(0);
    const persisted = await request.get(`/api/projects/${project.id}/play/${activeSession!.id}`);
    expect((await persisted.json()).session.scene.choices).toEqual([]);
  });
});
