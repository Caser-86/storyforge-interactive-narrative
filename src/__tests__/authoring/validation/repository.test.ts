import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import { createValidationRepository, type ValidationRepository } from "@/lib/authoring/validation/repository";

let tempDir: string;
let authoring: AuthoringRepository;
let validation: ValidationRepository;

const brief: CreateProjectInput = {
  title: "Validation Orchard",
  premise: "A courier tests a story release gate.",
  genre: "mystery",
  tone: "measured",
  pointOfView: "second person",
  rating: "PG",
  size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
};

describe("validation repository", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-validation-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    authoring = createAuthoringRepository({ dbPath, backupDir: path.join(tempDir, "backups") });
    validation = createValidationRepository({ dbPath, backupDir: path.join(tempDir, "backups") });
  });

  afterEach(() => {
    validation.close();
    authoring.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("replaces source issues while keeping stable fingerprints and run history", async () => {
    const project = await authoring.createProject(brief);
    const run = await validation.createRun(project.id, project.activeDraftVersionId!, 0, ["structural"]);
    const first = await validation.replaceIssues(project.activeDraftVersionId!, 0, "structural", [
      { source: "structural", severity: "blocking", code: "DEAD_END", message: "A path stops early.", nodeId: "node-a", detailsJson: { depth: 3 } },
    ], run.id);
    const second = await validation.replaceIssues(project.activeDraftVersionId!, 0, "structural", [
      { source: "structural", severity: "blocking", code: "DEAD_END", message: "The same path still stops early.", nodeId: "node-a", detailsJson: { depth: 3 } },
    ], run.id);

    expect(first[0]).toMatchObject({ source: "structural", status: "open", draftRevision: 0, code: "DEAD_END" });
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(second[0]?.fingerprint).toBe(first[0]?.fingerprint);
    expect((await validation.completeRun(run.id)).status).toBe("completed");
    expect((await validation.listIssues(project.id, project.activeDraftVersionId!, 0)).length).toBe(1);
  });

  it("allows warning dismissal but rejects blocking dismissal", async () => {
    const project = await authoring.createProject(brief);
    const versionId = project.activeDraftVersionId!;
    const warning = (await validation.replaceIssues(versionId, 0, "rule", [
      { source: "rule", severity: "warning", code: "SIMILAR_CHOICES", message: "Choices are similar." },
    ]))[0]!;
    const blocking = (await validation.replaceIssues(versionId, 0, "structural", [
      { source: "structural", severity: "blocking", code: "CYCLE", message: "The graph cycles." },
    ]))[0]!;

    expect((await validation.dismissWarning(warning.id)).status).toBe("dismissed");
    await expect(validation.dismissWarning(blocking.id)).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await validation.resolveIssue(blocking.id)).status).toBe("resolved");
  });
});
