export type HealthStatus = "ok" | "degraded" | "error";

export function computeOverallStatus(checks: Record<string, { status: string }>): HealthStatus {
  const dbOk = checks.database?.status === "ok";
  const redisOk = checks.redis?.status === "ok";
  const imageProvider = process.env.IMAGE_PROVIDER || "mock";
  const imageEnabled = process.env.ENABLE_IMAGE_GENERATION === "true";

  if (Object.values(checks).some((check) => check.status === "error")) return "error";
  if (!dbOk) return "error";

  if (imageEnabled && !redisOk && imageProvider !== "mock") return "error";
  if (imageEnabled && !redisOk && imageProvider === "mock") return "degraded";

  return "ok";
}
