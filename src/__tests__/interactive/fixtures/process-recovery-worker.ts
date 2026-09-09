import { createInteractiveJobRepository } from "@/lib/interactive/jobs";
import { openAuthoringDatabase } from "@/lib/authoring/database";

const [action, dbPath, backupDir, projectId, sessionId, timestampValue, holdDurationValue] = process.argv.slice(2);

if (!action || !dbPath || !backupDir || !projectId || !sessionId || !timestampValue) {
  throw new Error("Usage: process-recovery-worker <claim|complete> <dbPath> <backupDir> <projectId> <sessionId> <timestamp>");
}

async function main(): Promise<void> {
  if (action === "hold") {
    const holdMs = Number(holdDurationValue);
    if (!Number.isInteger(holdMs) || holdMs < 1) throw new Error(`Invalid hold duration: ${holdDurationValue}`);
    const database = openAuthoringDatabase({ dbPath, backupDir });
    let transactionStarted = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      process.stdout.write("locked");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMs);
      database.exec("COMMIT");
      transactionStarted = false;
    } finally {
      if (transactionStarted) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // The connection may already be closed after a failed lock operation.
        }
      }
      database.close();
    }
    return;
  }

  const jobs = createInteractiveJobRepository({ dbPath, backupDir });

  try {
    const now = new Date(timestampValue);
    if (Number.isNaN(now.getTime())) throw new Error(`Invalid timestamp: ${timestampValue}`);

    if (action === "claim") {
      const claim = await jobs.claimForSession(projectId, sessionId, now);
      process.stdout.write(JSON.stringify(claim));
    } else if (action === "complete") {
      const claim = await jobs.claimForSession(projectId, sessionId, now);
      const completed = claim ? await jobs.complete(claim, now) : false;
      process.stdout.write(JSON.stringify({ claim, completed }));
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }
  } finally {
    jobs.close();
  }
}

void main();
