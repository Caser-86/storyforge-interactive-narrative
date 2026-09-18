import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanAuthoringDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${SQLITE_E2E_PATH}${suffix}`, { force: true });
  }
}

test.describe("authoring generation pipeline", () => {
  test.beforeEach(() => cleanAuthoringDatabase());
  test.afterEach(() => cleanAuthoringDatabase());

  test("completes fixed-provider generation after pause and resume", async ({ request }) => {
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "Clockwork Orchard",
        premise: "A courier discovers a machine-grown forest beneath the city.",
        genre: "solarpunk mystery",
        tone: "hopeful suspense",
        pointOfView: "second person",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string; activeDraftVersionId: string };

    const createRun = await request.post(`/api/projects/${project.id}/generation`, {
      data: { versionId: project.activeDraftVersionId },
    });
    expect(createRun.status()).toBe(201);
    const run = (await createRun.json()).run as { id: string };

    const firstNext = await request.post(`/api/projects/${project.id}/generation/${run.id}/next`, { headers: { "x-storyforge-cli": "1" } });
    expect(firstNext.ok()).toBe(true);
    expect((await firstNext.json()).leasedSteps.length).toBeLessThanOrEqual(2);

    const pause = await request.patch(`/api/projects/${project.id}/generation/${run.id}`, { data: { action: "pause" } });
    expect(pause.ok()).toBe(true);
    const resume = await request.patch(`/api/projects/${project.id}/generation/${run.id}`, { data: { action: "resume" } });
    expect(resume.ok()).toBe(true);

    let finalRun: { status: string; progressCurrent: number; progressTotal: number } | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const next = await request.post(`/api/projects/${project.id}/generation/${run.id}/next`, { headers: { "x-storyforge-cli": "1" } });
      expect(next.ok()).toBe(true);
      const payload = await next.json();
      finalRun = payload.run;
      if (finalRun?.status === "completed") break;
    }

    expect(finalRun?.status).toBe("completed");
    expect(finalRun?.progressCurrent).toBe(finalRun?.progressTotal);

    const status = await request.get(`/api/projects/${project.id}/generation/${run.id}`);
    expect(status.ok()).toBe(true);
    const statusPayload = await status.json();
    expect(statusPayload.steps.filter((step: { status: string }) => step.status === "completed").length).toBe(statusPayload.steps.length);
    expect(statusPayload.steps.filter((step: { stage: string }) => step.stage === "nodes")).toHaveLength(8);
    expect(JSON.stringify(statusPayload)).not.toContain("rawResponse");
  });
});
