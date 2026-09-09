import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { manualStoryGraph, manualStoryProjectInput } from "./fixtures/manual-story";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

async function cleanAuthoringDatabase(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${SQLITE_E2E_PATH}${suffix}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(target, { force: true });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt === 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}

test.describe("authoring editor closed loop", () => {
  test.beforeEach(cleanAuthoringDatabase);
  test.afterEach(cleanAuthoringDatabase);

  test("edits choices, protects stale candidates, and previews an ending", async ({ page, request }) => {
    const created = await request.post("/api/projects", { data: manualStoryProjectInput });
    expect(created.ok()).toBe(true);
    const project = (await created.json()).project as { id: string; activeDraftVersionId: string };
    const graph = manualStoryGraph(project.activeDraftVersionId);

    const written = await request.put(`/api/projects/${project.id}/graph`, { data: { graph, expectedRevision: 0 } });
    expect(written.ok()).toBe(true);

    const validationResponse = page.waitForResponse((response) => response.url().includes(`/api/projects/${project.id}/validate`) && response.request().method() === "GET");
    await page.goto(`/projects/${project.id}/edit`);
    expect((await validationResponse).ok()).toBe(true);
    await expect(page.getByText("Manual Lantern Loop")).toBeVisible();
    const choiceLabel = page.getByLabel("选择文案").first();
    await expect(choiceLabel).toHaveValue("Enter the archive");
    await expect(choiceLabel).toBeEditable();
    const choicePatch = page.waitForResponse((response) => response.url().includes("/api/projects/") && response.request().method() === "PATCH");
    await choiceLabel.fill("Enter the author-approved archive");
    await choiceLabel.blur();
    expect((await choicePatch).ok()).toBe(true);

    const currentGraph = (await (await request.get(`/api/projects/${project.id}/graph`)).json()).graph as typeof graph;
    const startNode = currentGraph.nodes.find((node) => node.nodeKey === "start")!;
    const candidateResponse = await request.post(`/api/projects/${project.id}/nodes/${startNode.id}/regenerate`, { data: { expectedRevision: startNode.contentRevision } });
    expect(candidateResponse.status()).toBe(201);
    const candidate = (await candidateResponse.json()).candidate as { id: string };

    const nodePatch = await request.patch(`/api/projects/${project.id}/graph`, {
      data: { nodeId: startNode.id, patch: { body: "A newly authored gate line." }, expectedRevision: startNode.contentRevision },
    });
    expect(nodePatch.ok()).toBe(true);
    const staleApply = await request.post(`/api/projects/${project.id}/candidates/${candidate.id}`, { data: { expectedRevision: startNode.contentRevision + 1 } });
    expect(staleApply.status()).toBe(409);

    const snapshotResponse = await request.post(`/api/projects/${project.id}/snapshots`, { headers: { "x-storyforge-cli": "1" } });
    expect(snapshotResponse.status()).toBe(201);
    await page.goto(`/projects/${project.id}/preview`);
    await expect(page.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();
    for (const choice of ["Enter the author-approved archive", "Share it with the city"]) {
      await page.getByRole("button", { name: new RegExp(choice) }).click();
    }
    await expect(page.getByRole("heading", { name: "City of Lamps" })).toBeVisible();
    await expect(page.getByText("故事到达结局")).toBeVisible();
  });

  test("adds one author branch from the editor and keeps it connected to an ending", async ({ page, request }) => {
    const created = await request.post("/api/projects", {
      data: {
        ...manualStoryProjectInput,
        size: { preset: "custom", targetNodes: 12, targetEndings: 2 },
      },
    });
    expect(created.ok()).toBe(true);
    const project = (await created.json()).project as { id: string; activeDraftVersionId: string };
    const graph = manualStoryGraph(project.activeDraftVersionId);

    const written = await request.put(`/api/projects/${project.id}/graph`, { data: { graph, expectedRevision: 0 } });
    expect(written.ok()).toBe(true);

    const validationResponse = page.waitForResponse((response) => response.url().includes(`/api/projects/${project.id}/validate`) && response.request().method() === "GET");
    await page.goto(`/projects/${project.id}/edit`);
    expect((await validationResponse).ok()).toBe(true);
    await page.locator("button.outline-node-button").filter({ hasText: "Lantern Archive" }).click();
    const branchEditor = page.getByRole("region", { name: "新增作者分支" });
    await expect(branchEditor.getByRole("heading", { name: "新增作者分支" })).toBeVisible();

    await branchEditor.getByLabel("选择文案", { exact: true }).fill("Cross the flooded gallery");
    await branchEditor.getByLabel("新节点标题", { exact: true }).fill("Flooded Gallery");
    await branchEditor.getByLabel("新节点正文", { exact: true }).fill("Water climbs the gallery steps.");
    await branchEditor.getByLabel("新节点摘要", { exact: true }).fill("The courier finds a submerged route.");
    await branchEditor.getByLabel("新节点目标", { exact: true }).fill("Find a safe route back.");

    const branchWrite = page.waitForResponse((response) => response.url().includes(`/api/projects/${project.id}/graph`) && response.request().method() === "PUT");
    await branchEditor.getByRole("button", { name: "保存作者分支" }).click();
    expect((await branchWrite).ok()).toBe(true);
    await expect(page.getByText("已保存作者分支，已切换到新节点。")).toBeVisible();
    await expect(page.getByLabel("节点标题", { exact: true })).toHaveValue("Flooded Gallery");

    const persisted = (await (await request.get(`/api/projects/${project.id}/graph`)).json()).graph as typeof graph;
    expect(persisted.nodes).toHaveLength(graph.nodes.length + 1);
    expect(persisted.edges).toHaveLength(graph.edges.length + 2);
    expect(persisted.nodes.find((node) => node.title === "Flooded Gallery")).toMatchObject({ contentStatus: "review_required", authorModified: true });
    expect(persisted.edges.some((edge) => edge.label === "Cross the flooded gallery" && edge.branchType === "side")).toBe(true);
  });
});
