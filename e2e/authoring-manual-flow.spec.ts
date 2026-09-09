import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { expect, test } from "@playwright/test";
import { manualStoryGraph, manualStoryProjectInput } from "./fixtures/manual-story";
import type { StoryGraph } from "../src/lib/authoring/schemas";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanAuthoringDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${SQLITE_E2E_PATH}${suffix}`, { force: true });
  }
}

function assertOk(response: { ok(): boolean; status(): number; statusText(): string }, label: string): void {
  expect(response.ok(), `${label} failed with ${response.status()} ${response.statusText()}`).toBe(true);
}

test.describe("authoring manual closed loop", () => {
  test.beforeEach(() => {
    cleanAuthoringDatabase();
  });

  test.afterEach(() => {
    cleanAuthoringDatabase();
  });

  test("exports a sealed snapshot that runs from an offline file", async ({ browser, request }) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-export-e2e-"));
    const exportPath = path.join(tempDir, "manual-story.html");

    try {
      const createProject = await request.post("/api/projects", {
        data: manualStoryProjectInput,
      });
      assertOk(createProject, "create project");
      const projectPayload = await createProject.json();
      const project = projectPayload.project as { id: string; activeDraftVersionId: string };

      const initialGraph = manualStoryGraph(project.activeDraftVersionId);
      const writeGraph = await request.put(`/api/projects/${project.id}/graph`, {
        data: {
          graph: initialGraph,
          expectedRevision: 0,
        },
      });
      assertOk(writeGraph, "initial graph write");

      const editedBody = "The edited archive hums with a hand-authored line.";
      const editedGraph: StoryGraph = {
        ...initialGraph,
        nodes: initialGraph.nodes.map((node) =>
          node.nodeKey === "archive"
            ? {
                ...node,
                body: editedBody,
                contentRevision: node.contentRevision + 1,
              }
            : node,
        ),
      };
      const editGraph = await request.put(`/api/projects/${project.id}/graph`, {
        data: {
          graph: editedGraph,
          expectedRevision: 1,
        },
      });
      assertOk(editGraph, "edited graph write");

      const persistedGraphResponse = await request.get(`/api/projects/${project.id}/graph`);
      assertOk(persistedGraphResponse, "read edited graph");
      const persistedGraphPayload = await persistedGraphResponse.json();
      expect(JSON.stringify(persistedGraphPayload.graph)).toContain(editedBody);

    const createSnapshot = await request.post(`/api/projects/${project.id}/snapshots`, { headers: { "x-storyforge-cli": "1" } });
      assertOk(createSnapshot, "create snapshot");
      expect(createSnapshot.status()).toBe(201);
      const snapshotPayload = await createSnapshot.json();
      const snapshot = snapshotPayload.snapshot as { id: string; versionNumber: number };

      const preview = await request.post(`/api/projects/${project.id}/preview`, {
        data: {
          snapshotId: snapshot.id,
        },
      });
      assertOk(preview, "preview snapshot");
      const previewPayload = await preview.json();
      expect(JSON.stringify(previewPayload)).toContain(editedBody);
      expect(JSON.stringify(previewPayload)).not.toMatch(/SECRET_|objective|intent|consequenceSummary/);

      const previewSceneEdge = previewPayload.graph.edges.find(
        (edge: { label: string }) => edge.label === "Enter the archive",
      );
      const previewEndingEdge = previewPayload.graph.edges.find(
        (edge: { label: string }) => edge.label === "Share it with the city",
      );
      const previewScene = previewPayload.graph.nodes.find(
        (node: { id: string }) => node.id === previewSceneEdge.targetNodeId,
      );
      const previewEnding = previewPayload.graph.nodes.find(
        (node: { id: string }) => node.id === previewEndingEdge.targetNodeId,
      );
      expect(previewPayload.runtime.currentNodeId).toBe(previewSceneEdge.sourceNodeId);
      expect(previewScene.kind).toBe("scene");
      expect(previewEnding.kind).toBe("ending");

      const exportResponse = await request.get(`/api/projects/${project.id}/export/html?snapshotId=${snapshot.id}`);
      assertOk(exportResponse, "export html");
      expect(exportResponse.headers()["content-type"]).toBe("text/html; charset=utf-8");
      expect(exportResponse.headers()["content-disposition"]).toContain("attachment;");
      const html = await exportResponse.text();
      expect(html).not.toMatch(/SECRET_|objective|intent|consequenceSummary|fetch\(|https?:\/\//);
      fs.writeFileSync(exportPath, html, "utf8");

      const offlineContext = await browser.newContext();
      const blockedNetworkRequests: string[] = [];
      await offlineContext.route("**/*", async (route) => {
        const url = route.request().url();
        if (url.startsWith("file:")) {
          await route.continue();
          return;
        }

        blockedNetworkRequests.push(url);
        await route.abort();
      });

      const offlinePage = await offlineContext.newPage();
      await offlinePage.goto(pathToFileURL(exportPath).href);
      await expect(offlinePage.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();

      await offlinePage.evaluate(
        ({ projectId, versionNumber, endingEdgeId, sceneEdgeId, endingNodeId }) => {
          localStorage.setItem(
            `storyforge:${projectId}:${versionNumber}`,
            JSON.stringify({
              currentNodeId: endingNodeId,
              nodePath: [endingNodeId],
              edgePath: [endingEdgeId, sceneEdgeId],
              isEnding: true,
            }),
          );
        },
        {
          projectId: project.id,
          versionNumber: snapshot.versionNumber,
          endingEdgeId: previewEndingEdge.id,
          sceneEdgeId: previewSceneEdge.id,
          endingNodeId: previewEnding.id,
        },
      );
      await offlinePage.reload();
      await expect(offlinePage.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();

      await offlinePage.evaluate(
        ({ projectId, versionNumber, sceneEdgeId, sceneNodeId }) => {
          localStorage.setItem(
            `storyforge:${projectId}:${versionNumber}`,
            JSON.stringify({
              currentNodeId: sceneNodeId,
              nodePath: [sceneNodeId],
              edgePath: [sceneEdgeId],
              isEnding: false,
            }),
          );
        },
        {
          projectId: project.id,
          versionNumber: snapshot.versionNumber,
          sceneEdgeId: previewSceneEdge.id,
          sceneNodeId: previewScene.id,
        },
      );
      await offlinePage.reload();
      await expect(offlinePage.getByRole("heading", { name: "Lantern Archive" })).toBeVisible();
      await expect(offlinePage.getByRole("button", { name: "Back" })).toBeEnabled();

      await expect(offlinePage.getByText(editedBody)).toBeVisible();

      await offlinePage.getByRole("button", { name: "Back" }).click();
      await expect(offlinePage.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();

      await offlinePage.getByRole("button", { name: "Enter the archive" }).click();
      await offlinePage.getByRole("button", { name: "Share it with the city" }).click();
      await expect(offlinePage.getByRole("heading", { name: "City of Lamps" })).toBeVisible();
      await expect(offlinePage.getByText("Ending reached")).toBeVisible();

      await offlinePage.getByRole("button", { name: "Restart" }).click();
      await expect(offlinePage.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();
      expect(blockedNetworkRequests).toEqual([]);

      await offlineContext.close();

      const storageUnavailableContext = await browser.newContext();
      await storageUnavailableContext.addInitScript(() => {
        Storage.prototype.getItem = () => {
          throw new Error("storage blocked");
        };
        Storage.prototype.setItem = () => {
          throw new Error("storage blocked");
        };
        Storage.prototype.removeItem = () => {
          throw new Error("storage blocked");
        };
      });
      const storageUnavailablePage = await storageUnavailableContext.newPage();
      await storageUnavailablePage.goto(pathToFileURL(exportPath).href);
      await expect(storageUnavailablePage.getByRole("heading", { name: "Courtyard Gate" })).toBeVisible();
      await storageUnavailablePage.getByRole("button", { name: "Enter the archive" }).click();
      await storageUnavailablePage.getByRole("button", { name: "Share it with the city" }).click();
      await expect(storageUnavailablePage.getByText("Ending reached")).toBeVisible();
      await storageUnavailableContext.close();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
