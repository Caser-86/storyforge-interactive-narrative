import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { manualStoryGraph, manualStoryProjectInput } from "./fixtures/manual-story";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanAuthoringDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${SQLITE_E2E_PATH}${suffix}`, { force: true });
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

    await page.goto(`/projects/${project.id}/edit`);
    await expect(page.getByText("Manual Lantern Loop")).toBeVisible();
    const choiceLabel = page.getByLabel("选择文案").first();
    await expect(choiceLabel).toHaveValue("Enter the archive");
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

    const snapshotResponse = await request.post(`/api/projects/${project.id}/snapshots`);
    expect(snapshotResponse.status()).toBe(201);
    await page.goto(`/projects/${project.id}/preview`);
    await expect(page.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();
    for (const choice of ["Enter the author-approved archive", "Share it with the city"]) {
      await page.getByRole("button", { name: new RegExp(choice) }).click();
    }
    await expect(page.getByRole("heading", { name: "City of Lamps" })).toBeVisible();
    await expect(page.getByText("故事到达结局")).toBeVisible();
  });
});
