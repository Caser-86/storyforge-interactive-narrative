import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { expect, test } from "@playwright/test";
import { manualStoryGraph, manualStoryProjectInput } from "./fixtures/manual-story";

const databasePath = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

test.describe("authoring offline release", () => {
  test.beforeEach(cleanDatabase);
  test.afterEach(cleanDatabase);

  test("plays an exported file with every non-file request denied", async ({ browser, request }) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-offline-export-"));
    const htmlPath = path.join(tempDir, "story.html");
    try {
      const projectResponse = await request.post("/api/projects", { data: manualStoryProjectInput });
      expect(projectResponse.ok()).toBe(true);
      const project = (await projectResponse.json()).project as { id: string; activeDraftVersionId: string };
      const graphResponse = await request.put(`/api/projects/${project.id}/graph`, { data: { graph: manualStoryGraph(project.activeDraftVersionId), expectedRevision: 0 } });
      expect(graphResponse.ok()).toBe(true);
      const snapshotResponse = await request.post(`/api/projects/${project.id}/snapshots`);
      expect(snapshotResponse.ok()).toBe(true);
      const snapshot = (await snapshotResponse.json()).snapshot as { id: string };
      const exportResponse = await request.get(`/api/projects/${project.id}/export/html?snapshotId=${snapshot.id}`);
      expect(exportResponse.ok()).toBe(true);
      const html = await exportResponse.text();
      expect(html).not.toMatch(/fetch\(|https?:\/\//);
      fs.writeFileSync(htmlPath, html, "utf8");

      const context = await browser.newContext();
      const blocked: string[] = [];
      await context.route("**/*", async (route) => {
        if (route.request().url().startsWith("file:")) return route.continue();
        blocked.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      await page.goto(pathToFileURL(htmlPath).href);
      await page.getByRole("button", { name: "Enter the archive" }).click();
      await page.getByRole("button", { name: "Share it with the city" }).click();
      await expect(page.getByRole("heading", { name: "City of Lamps" })).toBeVisible();
      expect(blocked).toEqual([]);
      await context.close();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
