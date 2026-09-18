import { z } from "zod";

export const DiagnosticReportSchema = z
  .object({
    schema: z.literal("storyforge-diagnostics@1"),
    status: z.enum(["ok", "warning", "error"]),
    generatedAt: z.string().datetime({ offset: true }),
    database: z
      .object({
        status: z.enum(["ok", "error"]),
        migrationVersion: z.number().int().min(0).nullable(),
        pendingMigrations: z.boolean(),
        integrity: z.enum(["ok", "error", "unknown"]),
        writable: z.boolean(),
      })
      .strict(),
    backup: z
      .object({
        status: z.enum(["ok", "warning", "error"]),
        freshness: z.enum(["fresh", "stale", "missing", "unknown"]),
        latestCreatedAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
    network: z
      .object({
        binding: z.enum(["loopback-only", "lan-override"]),
      })
      .strict(),
    provider: z
      .object({
        status: z.enum(["configured", "not-configured"]),
      })
      .strict(),
  })
  .strict();

export type DiagnosticReport = z.infer<typeof DiagnosticReportSchema>;
