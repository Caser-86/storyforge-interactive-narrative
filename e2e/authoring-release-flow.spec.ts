import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { manualStoryGraph } from "./fixtures/manual-story";

const databasePath = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

test.describe("authoring release gate", () => {
  test.beforeEach(cleanDatabase);
  test.afterEach(cleanDatabase);

  test("generates, edits, validates, snapshots, backs up, deletes, and restores a project", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: {
        title: "Release Gate Story",
        premise: "A finite story survives a complete local release cycle.",
        genre: "mystery",
        tone: "measured",
        pointOfView: "third person",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(create.ok()).toBe(true);
    const project = (await create.json()).project as { id: string; activeDraftVersionId: string };

    const runResponse = await request.post(`/api/projects/${project.id}/generation`, { data: { versionId: project.activeDraftVersionId } });
    expect(runResponse.status()).toBe(201);
    const run = (await runResponse.json()).run as { id: string };
    let finalRun: { status: string } | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const next = await request.post(`/api/projects/${project.id}/generation/${run.id}/next`, { headers: { "x-storyforge-cli": "1" } });
      expect(next.ok()).toBe(true);
      finalRun = (await next.json()).run;
      if (finalRun?.status === "completed") break;
    }
    expect(finalRun?.status).toBe("completed");

    let targetProjectId = project.id;
    let targetVersionId = project.activeDraftVersionId;
    let graphResponse = await request.get(`/api/projects/${targetProjectId}/graph`);
    expect(graphResponse.ok()).toBe(true);
    let graph = (await graphResponse.json()).graph as { nodes: Array<{ id: string; body: string; contentRevision: number }>; edges: unknown[] };
    if (graph.nodes.length === 0) {
      const manualProjectResponse = await request.post("/api/projects", {
        data: {
          title: "Release Gate Manual Draft",
          premise: "A generated brief is completed before the author fills the finite graph.",
          genre: "mystery",
          tone: "measured",
          pointOfView: "third person",
          rating: "PG-13",
          size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
        },
      });
      expect(manualProjectResponse.ok()).toBe(true);
      const manualProject = (await manualProjectResponse.json()).project as { id: string; activeDraftVersionId: string };
      targetProjectId = manualProject.id;
      targetVersionId = manualProject.activeDraftVersionId;
      const manualGraphResponse = await request.put(`/api/projects/${targetProjectId}/graph`, {
        data: { graph: manualStoryGraph(targetVersionId), expectedRevision: 0 },
      });
      expect(manualGraphResponse.ok()).toBe(true);
      graphResponse = await request.get(`/api/projects/${targetProjectId}/graph`);
      graph = (await graphResponse.json()).graph;
    }
    const node = graph.nodes[0]!;
    const edit = await request.patch(`/api/projects/${targetProjectId}/graph`, {
      data: { nodeId: node.id, patch: { body: `${node.body} Release edited.` }, expectedRevision: node.contentRevision },
    });
    expect(edit.ok()).toBe(true);

    const validation = await request.post(`/api/projects/${targetProjectId}/validate`, { data: { sources: ["structural", "rule"] } });
    expect(validation.ok()).toBe(true);
    const decision = await request.get(`/api/projects/${targetProjectId}/validate`);
    expect(decision.ok()).toBe(true);
    expect((await decision.json()).allowed).toBe(true);

    const snapshot = await request.post(`/api/projects/${targetProjectId}/snapshots`, { headers: { "x-storyforge-cli": "1" } });
    expect(snapshot.status()).toBe(201);
    const snapshotId = (await snapshot.json()).snapshot.id as string;
    const html = await request.get(`/api/projects/${targetProjectId}/export/html?snapshotId=${snapshotId}`);
    expect(html.ok()).toBe(true);
    expect((await html.text())).not.toMatch(/OPENAI_API_KEY|rawResponse|PRIVATE_/);

    const backupResponse = await request.get(`/api/projects/${targetProjectId}/backup`);
    expect(backupResponse.ok()).toBe(true);
    const backup = await backupResponse.json();
    const deleted = await request.delete(`/api/projects/${targetProjectId}`, { headers: { "x-storyforge-cli": "1" } });
    expect(deleted.status()).toBe(204);

    const imported = await request.post("/api/projects/import", { data: { backup, mode: "new-id" } });
    expect(imported.status()).toBe(201);
    const restoredProject = (await imported.json()).project as { id: string };
    const restoredGraph = await request.get(`/api/projects/${restoredProject.id}/graph`);
    expect(restoredGraph.ok()).toBe(true);
    const restored = (await restoredGraph.json()).graph as { nodes: unknown[]; edges: unknown[] };
    expect(restored.nodes).toHaveLength(graph.nodes.length);
    expect(restored.edges).toHaveLength(graph.edges.length);
  });

  test("keeps project filters and actions usable on desktop and mobile", async ({ page, request }) => {
    const createProject = async (title: string) => {
      const response = await request.post("/api/projects", {
        data: {
          title,
          premise: "A local project remains searchable throughout its authoring lifecycle.",
          genre: "mystery",
          tone: "measured",
          pointOfView: "third person",
          rating: "PG-13",
          size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
        },
      });
      expect(response.ok()).toBe(true);
      return (await response.json()).project as { id: string };
    };

    await createProject("潮汐档案");
    const archivedProject = await createProject("归档手记");
    const archiveResponse = await request.patch(`/api/projects/${archivedProject.id}`, {
      data: { status: "archived" },
    });
    expect(archiveResponse.ok()).toBe(true);

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "项目库" })).toBeVisible();

      await page.getByLabel("筛选项目").fill("潮汐");
      await expect(page.getByRole("heading", { name: "潮汐档案" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "归档手记" })).not.toBeVisible();

      await page.getByLabel("筛选项目").fill("");
      await page.getByLabel("项目状态").selectOption("archived");
      await expect(page.getByRole("heading", { name: "归档手记" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "潮汐档案" })).not.toBeVisible();

      const actionButtons = page.locator(".project-actions button");
      for (let index = 0; index < await actionButtons.count(); index += 1) {
        const button = actionButtons.nth(index);
        await button.focus();
        await expect(button).toBeFocused();
      }
    }
  });
});
