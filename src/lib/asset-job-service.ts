import { enqueueAssetJob, type AssetJobData } from "./asset-queue";
import { query } from "./db";
import { getErrorMessage } from "./errors";

type FailureUpdateMode = "throw" | "warn";

interface EnqueueWithFailureMarkOptions {
  failureUpdate?: FailureUpdateMode;
}

async function markWorkerUnavailable(assetJobId: string, reason: string, mode: FailureUpdateMode): Promise<void> {
  try {
    await query(
      "UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2",
      [`Worker unavailable: ${reason || "unknown"}`, assetJobId]
    );
  } catch (err) {
    if (mode === "warn") {
      console.warn("Failed to mark asset job unavailable:", getErrorMessage(err));
      return;
    }
    throw err;
  }
}

export async function enqueueAssetJobWithFailureMark(
  data: AssetJobData,
  options: EnqueueWithFailureMarkOptions = {}
): Promise<{ queued: boolean; reason?: string }> {
  const failureUpdate = options.failureUpdate || "throw";

  try {
    const result = await enqueueAssetJob(data);
    if (!result.queued) {
      const reason = result.reason || "unknown";
      await markWorkerUnavailable(data.assetJobId, reason, failureUpdate);
      return { queued: false, reason };
    }
    return result;
  } catch (err) {
    const reason = getErrorMessage(err);
    console.warn("Failed to enqueue asset job:", reason);
    await markWorkerUnavailable(data.assetJobId, reason, failureUpdate);
    return { queued: false, reason };
  }
}
