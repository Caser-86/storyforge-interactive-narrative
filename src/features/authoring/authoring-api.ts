import { CreateProjectResponseSchema, EdgePatchResponseSchema, NodePatchResponseSchema } from "@/lib/authoring/api-contracts";
import type { CreateProjectInputPayload } from "@/lib/authoring/api-contracts";
import type { Project, StoryEdgePatch, StoryNodePatch } from "@/lib/authoring/schemas";
import {
  GenerationListResponseSchema,
  GenerationNextResponseSchema,
  GenerationResponseSchema,
  GenerationStatusResponseSchema,
  CandidateApplyResponseSchema,
  CandidateResponseSchema,
} from "@/lib/authoring/generation/api-contracts";
import type { GenerationStatusResponse } from "@/lib/authoring/generation/api-contracts";
import type { GenerationRun } from "@/lib/authoring/generation/schemas";
import { PreviewResponseSchema, SnapshotResponseSchema } from "@/lib/authoring/preview-contracts";
import type { PreviewResponse } from "@/lib/authoring/preview-contracts";

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return new Error(body.error?.message ?? `请求失败（${response.status}）`);
  } catch {
    return new Error(`请求失败（${response.status}）`);
  }
}

export async function createProject(input: CreateProjectInputPayload): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw await responseError(response);

  return CreateProjectResponseSchema.parse(await response.json()).project;
}

async function parseJson<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  if (!response.ok) throw await responseError(response);
  return parse(await response.json());
}

export async function listGenerationRuns(projectId: string): Promise<GenerationRun[]> {
  const response = await fetch(`/api/projects/${projectId}/generation`);
  return parseJson(response, (value) => GenerationListResponseSchema.parse(value).runs);
}

export async function createGenerationRun(projectId: string): Promise<GenerationRun> {
  const response = await fetch(`/api/projects/${projectId}/generation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return parseJson(response, (value) => GenerationResponseSchema.parse(value).run);
}

export async function getGenerationStatus(projectId: string, runId: string): Promise<GenerationStatusResponse> {
  const response = await fetch(`/api/projects/${projectId}/generation/${runId}`);
  return parseJson(response, (value) => GenerationStatusResponseSchema.parse(value));
}

export async function advanceGeneration(projectId: string, runId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/projects/${projectId}/generation/${runId}/next`, { method: "POST", signal });
  return parseJson(response, (value) => GenerationNextResponseSchema.parse(value));
}

export async function generationAction(
  projectId: string,
  runId: string,
  action: "pause" | "resume" | "cancel",
): Promise<GenerationRun> {
  const response = await fetch(`/api/projects/${projectId}/generation/${runId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return parseJson(response, (value) => GenerationResponseSchema.parse(value).run);
}

export async function patchNode(projectId: string, nodeId: string, patch: StoryNodePatch, expectedRevision: number) {
  const response = await fetch(`/api/projects/${projectId}/graph`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nodeId, patch, expectedRevision }),
  });
  return parseJson(response, (value) => NodePatchResponseSchema.parse(value));
}

export async function patchEdge(projectId: string, edgeId: string, patch: StoryEdgePatch, expectedRevision: number) {
  const response = await fetch(`/api/projects/${projectId}/graph`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edgeId, patch, expectedRevision }),
  });
  return parseJson(response, (value) => EdgePatchResponseSchema.parse(value));
}

export async function regenerateNode(projectId: string, nodeId: string, expectedRevision: number) {
  const response = await fetch(`/api/projects/${projectId}/nodes/${nodeId}/regenerate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision }),
  });
  return parseJson(response, (value) => CandidateResponseSchema.parse(value).candidate);
}

export async function applyCandidate(projectId: string, candidateId: string, expectedRevision: number) {
  const response = await fetch(`/api/projects/${projectId}/candidates/${candidateId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision }),
  });
  return parseJson(response, (value) => CandidateApplyResponseSchema.parse(value));
}

export async function rejectCandidate(projectId: string, candidateId: string) {
  const response = await fetch(`/api/projects/${projectId}/candidates/${candidateId}`, { method: "DELETE" });
  return parseJson(response, (value) => CandidateResponseSchema.parse(value).candidate);
}

export async function createPreviewSnapshot(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/snapshots`, { method: "POST" });
  return parseJson(response, (value) => SnapshotResponseSchema.parse(value).snapshot);
}

export async function loadPreview(projectId: string, snapshotId: string): Promise<PreviewResponse> {
  const response = await fetch(`/api/projects/${projectId}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshotId }),
  });
  return parseJson(response, (value) => PreviewResponseSchema.parse(value));
}
