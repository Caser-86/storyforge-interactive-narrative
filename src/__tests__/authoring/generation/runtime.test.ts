import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { createProjectGenerationExecutor } from "@/lib/authoring/generation/runtime";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
  delete process.env.GENERATION_PROVIDER;
});

describe("generation runtime", () => {
  it("completes the fixed-provider staged pipeline with bounded node work", async () => {
    process.env.GENERATION_PROVIDER = "fake";
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-runtime-"));
    tempDirs.push(tempDir);
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const authoring = createAuthoringRepository({ dbPath, backupDir });
    const generation = createGenerationRepository({ dbPath, backupDir });
    try {
      const project = await authoring.createProject({
        title: "Clockwork Orchard",
        premise: "A courier discovers a machine-grown forest beneath the city.",
        genre: "solarpunk mystery",
        tone: "hopeful suspense",
        pointOfView: "second person",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      });
      const run = await generation.createRun(project.id, project.activeDraftVersionId!, { now: new Date("2026-08-19T12:00:00.000Z") });
      const executor = await createProjectGenerationExecutor(project.id, generation, authoring);

      for (let minute = 0; minute < 40; minute += 1) {
        const result = await executor.executeNext(run.id, new Date(Date.UTC(2026, 7, 19, 12, minute, 0)));
        if (result.runStatus === "completed" || result.runStatus === "failed") break;
      }

      const completed = await generation.getRun(run.id);
      const steps = await generation.listSteps(run.id);
      expect(completed.status).toBe("completed");
      expect(steps.filter((step) => step.status === "completed").length).toBe(steps.length);
      expect(steps.filter((step) => step.stage === "nodes")).toHaveLength(8);
      expect(completed.progressCurrent).toBe(completed.progressTotal);
    } finally {
      generation.close();
      authoring.close();
    }
  });
});
