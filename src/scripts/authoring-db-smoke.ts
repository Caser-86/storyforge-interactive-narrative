import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { runAuthoringMigrations } from "../lib/authoring/database";
import { createAuthoringRepository } from "../lib/authoring/repository";
import { getErrorMessage } from "../lib/errors";

async function smoke(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-authoring-smoke-"));
  const dbPath = path.join(tempDir, "authoring.sqlite");
  const backupDir = path.join(tempDir, "backups");

  try {
    runAuthoringMigrations({ dbPath, backupDir });
    runAuthoringMigrations({ dbPath, backupDir });

    const repo = createAuthoringRepository({ dbPath, backupDir });
    try {
      const project = await repo.createProject({
        title: "Authoring Smoke",
        premise: "A tiny closed-loop authoring project proves persistence works.",
        genre: "test fiction",
        tone: "clear",
        pointOfView: "second person",
        rating: "PG",
        size: {
          preset: "micro",
          targetNodes: 8,
          targetEndings: 2,
        },
        settingsJson: {
          smoke: true,
        },
      });

      const graph = await repo.getProjectGraph(project.id);
      if (graph.versionId !== project.activeDraftVersionId || graph.nodes.length !== 0) {
        throw new Error("Authoring smoke graph read did not match the created draft");
      }

      await repo.deleteProject(project.id);
      const remainingProjects = await repo.listProjects();
      if (remainingProjects.some((item) => item.id === project.id)) {
        throw new Error("Authoring smoke project delete did not remove the project");
      }
    } finally {
      repo.close();
    }

    console.log(`Authoring DB smoke passed using ${dbPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  smoke().catch((error) => {
    console.error(getErrorMessage(error));
    process.exit(1);
  });
}
