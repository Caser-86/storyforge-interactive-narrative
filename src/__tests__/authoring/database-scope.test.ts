import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthoringDatabaseScope, initializeAuthoringDatabase } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { createValidationRepository } from "@/lib/authoring/validation/repository";
import { createInteractiveJobRepository } from "@/lib/interactive/jobs";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { createInteractiveUsageRepository } from "@/lib/interactive/usage";

let tempDir: string;

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("authoring database scope", () => {
  it("lets repositories borrow one connection without closing the owner", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-database-scope-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const database = initializeAuthoringDatabase({ dbPath, backupDir });
    const options = { dbPath, backupDir, database };
    const authoring = createAuthoringRepository(options);
    const repositories = [
      authoring,
      createGenerationRepository(options),
      createValidationRepository(options),
      createInteractiveRepository(options),
      createInteractiveJobRepository(options),
      createInteractiveUsageRepository(options),
    ];

    try {
      for (const repository of repositories) repository.close();
      expect(database.open).toBe(true);
      await expect(authoring.listProjects()).resolves.toEqual([]);
    } finally {
      database.close();
    }
  });

  it("gives a request-scoped owner to multiple repositories and releases it once", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-request-database-scope-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const scope = createAuthoringDatabaseScope({ dbPath, backupDir });
    const authoring = createAuthoringRepository(scope.options);
    const generation = createGenerationRepository(scope.options);
    const interactive = createInteractiveRepository(scope.options);

    try {
      await authoring.listProjects();
      await generation.listRuns("missing-project");
      await interactive.listSessionSummaries("missing-project");
      authoring.close();
      generation.close();
      interactive.close();
      expect(scope.database.open).toBe(true);
    } finally {
      scope.close();
      scope.close();
    }

    expect(scope.database.open).toBe(false);
  });
});
