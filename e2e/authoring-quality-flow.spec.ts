import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { manualStoryGraph, manualStoryProjectInput } from "./fixtures/manual-story";
import type { StoryGraph } from "../src/lib/authoring/schemas";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanAuthoringDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${SQLITE_E2E_PATH}${suffix}`, { force: true });
}

test.describe("authoring quality loop", () => {
  test.beforeEach(async ({ request }) => {
    cleanAuthoringDatabase();
    const health = await request.get("/api/health");
    expect(health.ok()).toBe(true);
  });
  test.afterEach(cleanAuthoringDatabase);

  test("blocks structural defects, dismisses warnings, detects stale revisions, and closes a release path", async ({ page, request }) => {
    const created = await request.post("/api/projects", { data: manualStoryProjectInput });
    expect(created.ok()).toBe(true);
    const project = (await created.json()).project as { id: string; activeDraftVersionId: string };
    const validGraph = manualStoryGraph(project.activeDraftVersionId);

    expect((await request.put(`/api/projects/${project.id}/graph`, { data: { graph: validGraph, expectedRevision: 0 } })).ok()).toBe(true);

    const brokenGraph: StoryGraph = {
      ...validGraph,
      edges: [
        ...validGraph.edges.filter((edge) => edge.id !== `${project.activeDraftVersionId}-edge-oath-keeper`),
        {
          ...validGraph.edges[0]!,
          id: `${project.activeDraftVersionId}-edge-cycle`,
          sourceNodeId: validGraph.nodes.find((node) => node.nodeKey === "archive-vault")!.id,
          targetNodeId: validGraph.nodes.find((node) => node.nodeKey === "start")!.id,
          label: "Return to the gate",
          sortOrder: 1,
        },
      ],
    };
    expect((await request.put(`/api/projects/${project.id}/graph`, { data: { graph: brokenGraph, expectedRevision: 1 } })).ok()).toBe(true);
    const brokenValidation = await request.post(`/api/projects/${project.id}/validate`, { data: { sources: ["structural", "rule"] } });
    expect(brokenValidation.ok()).toBe(true);
    const brokenPayload = await brokenValidation.json();
    expect(brokenPayload.allowed).toBe(false);
    expect(brokenPayload.blocking.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(["CYCLE", "DEAD_END"]));

    const warningGraph: StoryGraph = {
      ...validGraph,
      edges: validGraph.edges.map((edge) => {
        if (edge.id.endsWith("edge-archive-chamber")) return { ...edge, label: "Follow the keeper route toward the old light" };
        if (edge.id.endsWith("edge-archive-city")) return { ...edge, label: "Follow the keeper route toward the old dawn" };
        return edge;
      }),
    };
    expect((await request.put(`/api/projects/${project.id}/graph`, { data: { graph: warningGraph, expectedRevision: 2 } })).ok()).toBe(true);
    const warningValidation = await request.post(`/api/projects/${project.id}/validate`, { data: { sources: ["structural", "rule"] } });
    const warningPayload = await warningValidation.json();
    expect(warningPayload.allowed).toBe(true);
    expect(warningPayload.warnings.map((issue: { code: string }) => issue.code)).toContain("SIMILAR_CHOICES");

    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await page.goto(`/projects/${project.id}/edit`);
    await expect(page.getByText("SIMILAR_CHOICES")).toBeVisible();
    const dismissResponse = page.waitForResponse((response) => response.url().includes(`/validation/`) && response.request().method() === "PATCH");
    await page.locator(".quality-issue").filter({ hasText: "SIMILAR_CHOICES" }).getByRole("button", { name: "忽略 warning" }).click();
    expect((await dismissResponse).ok()).toBe(true);
    await expect(page.getByText("SIMILAR_CHOICES")).not.toBeVisible();

    const staleGraph = {
      ...warningGraph,
      nodes: warningGraph.nodes.map((node) => node.nodeKey === "archive" ? { ...node, body: "A revised archive passage." } : node),
    } satisfies StoryGraph;
    expect((await request.put(`/api/projects/${project.id}/graph`, { data: { graph: staleGraph, expectedRevision: 3 } })).ok()).toBe(true);
    await page.reload();
    await expect(page.getByText("暂不可发布")).toBeVisible();
    await expect(page.getByText("修订 未验证")).toBeVisible();

    const revalidated = await request.post(`/api/projects/${project.id}/validate`, { data: { sources: ["structural", "rule"] } });
    const revalidatedPayload = await revalidated.json();
    expect(revalidatedPayload.allowed).toBe(true);
    const snapshot = await request.post(`/api/projects/${project.id}/snapshots`);
    expect(snapshot.status()).toBe(201);

    await page.goto(`/projects/${project.id}/preview`);
    await expect(page.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();
    await page.getByRole("button", { name: "Enter the archive" }).click();
    await page.getByRole("button", { name: "Follow the keeper route toward the old dawn" }).click();
    await expect(page.getByRole("heading", { name: "City of Lamps" })).toBeVisible();
    await expect(page.getByText("故事到达结局")).toBeVisible();
  });
});
