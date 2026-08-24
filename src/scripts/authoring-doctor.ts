import { pathToFileURL } from "url";
import path from "path";
import { collectAuthoringDiagnostics } from "../lib/authoring/diagnostics";
import { loadAuthoringEnv } from "../lib/authoring/local-env";
import { getErrorMessage } from "../lib/errors";

export async function runAuthoringDoctor(): Promise<void> {
  loadAuthoringEnv();
  const report = await collectAuthoringDiagnostics();
  console.log(JSON.stringify(report, null, 2));
  if (report.database.status === "error") console.log("Action: stop StoryForge and inspect the local SQLite database before creating new work.");
  if (report.backup.freshness !== "fresh") console.log("Action: run npm run db:authoring:checkpoint, then rehearse it with npm run db:authoring:restore-check -- --latest.");
  if (report.provider.status === "not-configured") console.log("Action: configure the local provider environment before starting real generation.");
  if (report.network.binding === "lan-override") console.log("Action: disable STORYFORGE_ALLOW_LAN unless temporary private-network access is intentional.");
  if (report.status === "error") process.exitCode = 1;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  runAuthoringDoctor().catch((error) => {
    console.error(getErrorMessage(error));
    process.exit(1);
  });
}
