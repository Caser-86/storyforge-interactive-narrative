import { z } from "zod";
import type { GraphLimits } from "./graph";

export const ReleaseProfileSchema = z.enum(["selected_path", "branching_graph"]);
export type ReleaseProfile = z.infer<typeof ReleaseProfileSchema>;

const StoredReleasePolicySchema = z
  .object({
    minNodes: z.number().int().min(0),
    minEndings: z.number().int().min(0),
    maxNodes: z.number().int().min(1),
    maxEndings: z.number().int().min(1),
    releaseProfile: ReleaseProfileSchema.optional().default("branching_graph"),
  })
  .strict();

export type StoredReleasePolicy = z.infer<typeof StoredReleasePolicySchema>;

export function resolveReleaseLimits(
  profile: ReleaseProfile,
  size: { targetNodeCount: number; targetEndingCount: number },
): GraphLimits {
  return {
    minNodes: profile === "selected_path" ? 2 : 8,
    minEndings: profile === "selected_path" ? 1 : 2,
    maxNodes: size.targetNodeCount,
    maxEndings: size.targetEndingCount,
  };
}

export function serializeReleasePolicy(profile: ReleaseProfile, limits: GraphLimits): string {
  return JSON.stringify({ ...limits, releaseProfile: profile });
}

export function parseStoredReleasePolicy(value: string | unknown): StoredReleasePolicy {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return StoredReleasePolicySchema.parse(parsed);
}
