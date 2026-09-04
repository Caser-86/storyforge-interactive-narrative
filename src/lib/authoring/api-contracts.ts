import { z } from "zod";
import { AuthoringError } from "./errors";
import {
  JsonValueSchema,
  ProjectSchema,
  ProjectSizeSchema,
  StoryGraphSchema,
  StoryEdgePatchSchema,
  StoryEdgeSchema,
  StoryNodePatchSchema,
  StoryNodeSchema,
  ValidationIssueSchema,
  MAX_SETTINGS_JSON_CHARS,
} from "./schemas";

export const CreateProjectInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    premise: z.string().trim().min(1).max(4_000),
    genre: z.string().trim().min(1).max(80),
    tone: z.string().trim().min(1).max(160),
    pointOfView: z.string().trim().min(1).max(80),
    rating: z.string().trim().min(1).max(32),
    size: ProjectSizeSchema,
    settingsJson: JsonValueSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const serialized = JSON.stringify(input.settingsJson ?? {});
    if (serialized.length > MAX_SETTINGS_JSON_CHARS) {
      context.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_SETTINGS_JSON_CHARS, type: "string", inclusive: true, path: ["settingsJson"], message: "settingsJson must be at most 32000 serialized characters" });
    }
  });

export const PatchProjectInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    premise: z.string().trim().min(1).max(4_000).optional(),
    genre: z.string().trim().min(1).max(80).optional(),
    tone: z.string().trim().min(1).max(160).optional(),
    pointOfView: z.string().trim().min(1).max(80).optional(),
    rating: z.string().trim().min(1).max(32).optional(),
    size: ProjectSizeSchema.optional(),
    status: z.enum(["draft", "generating", "ready", "archived"]).optional(),
    settingsJson: JsonValueSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one editable project field is required.",
  })
  .superRefine((input, context) => {
    const serialized = JSON.stringify(input.settingsJson ?? {});
    if (serialized.length > MAX_SETTINGS_JSON_CHARS) {
      context.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_SETTINGS_JSON_CHARS, type: "string", inclusive: true, path: ["settingsJson"], message: "settingsJson must be at most 32000 serialized characters" });
    }
  });

// Eight megabytes keeps the graph endpoint bounded while covering the documented
// 80-node and 12,000-character node-body limits when content is UTF-8 Chinese text.
export const MAX_GRAPH_WRITE_BYTES = 8_000_000;

export const GraphWriteInputSchema = z
  .object({
    graph: StoryGraphSchema,
    expectedRevision: z.number().int().min(0),
  })
  .strict();

export const NodePatchInputSchema = z
  .object({
    nodeId: z.string().min(1),
    patch: StoryNodePatchSchema,
    expectedRevision: z.number().int().min(0),
  })
  .strict();

export const NodePatchResponseSchema = z
  .object({
    node: StoryNodeSchema,
    draftRevision: z.number().int().min(0),
  })
  .strict();

export const EdgePatchInputSchema = z
  .object({
    edgeId: z.string().min(1),
    patch: StoryEdgePatchSchema,
    expectedRevision: z.number().int().min(0),
  })
  .strict();

export const EdgePatchResponseSchema = z
  .object({
    edge: StoryEdgeSchema,
    draftRevision: z.number().int().min(0),
  })
  .strict();

export const ProjectSummarySchema = ProjectSchema.extend({
  draftRevision: z.number().int().min(0).nullable(),
  versionCount: z.number().int().min(0),
  snapshotCount: z.number().int().min(0),
  blockingIssueCount: z.number().int().min(0),
}).strict();

export const ProjectResponseSchema = z
  .object({
    project: ProjectSchema,
  })
  .strict();

export const ProjectImportResponseSchema = z
  .object({
    project: ProjectSchema,
    recovery: z
      .object({
        fileName: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        createdAt: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const CreateProjectResponseSchema = ProjectResponseSchema;

export const ListProjectsResponseSchema = z
  .object({
    projects: z.array(ProjectSummarySchema),
  })
  .strict();

export const StoryGraphResponseSchema = z
  .object({
    graph: StoryGraphSchema,
  })
  .strict();

export const GraphWriteResponseSchema = z
  .object({
    graph: StoryGraphSchema,
    issues: z.array(ValidationIssueSchema),
  })
  .strict();

export const ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

type ErrorPayload = z.infer<typeof ErrorResponseSchema>;

function validationDetails(error: z.ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.map(String),
      message: issue.message,
    })),
  };
}

export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 512_000): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new AuthoringError("VALIDATION", "Request body is too large.");
    }
  }

  const readBody = async (): Promise<string> => {
    if (request.body === null) return "";
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        totalBytes += chunk.value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new AuthoringError("VALIDATION", "Request body is too large.");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  };

  let json: unknown;

  try {
    json = JSON.parse(await readBody());
  } catch (error) {
    if (error instanceof AuthoringError) {
      throw error;
    }
    throw new AuthoringError("VALIDATION", "Malformed JSON");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AuthoringError("VALIDATION", "Invalid request body", validationDetails(parsed.error));
  }

  return parsed.data;
}

export function parseVersionIdFromRequest(request: Request): string | undefined {
  const versionId = new URL(request.url).searchParams.get("versionId");

  if (versionId === null) {
    return undefined;
  }

  const trimmed = versionId.trim();
  if (trimmed.length === 0) {
    throw new AuthoringError("VALIDATION", "versionId must not be empty");
  }

  return trimmed;
}

export function json<T>(schema: z.ZodType<T>, body: T, init?: ResponseInit): Response {
  return Response.json(schema.parse(body), init);
}

export function empty(status: number): Response {
  return new Response(null, { status });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AuthoringError) {
    return authoringErrorResponse(error);
  }

  return json(
    ErrorResponseSchema,
    {
      error: {
        code: "STORAGE",
        message: "Internal server error",
      },
    },
    { status: 500 },
  );
}

function authoringErrorResponse(error: AuthoringError): Response {
  const status = statusForAuthoringCode(error.code);
  const payload: ErrorPayload = {
    error: {
      code: error.code,
      message: status === 500 ? "Internal server error" : error.message,
    },
  };

  if (status !== 500 && error.details !== undefined) {
    payload.error.details = error.details;
  }

  return json(ErrorResponseSchema, payload, { status });
}

function statusForAuthoringCode(code: AuthoringError["code"]): number {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "IMMUTABLE_VERSION":
    case "BLOCKING_ISSUES":
      return 422;
    case "STORAGE":
    case "EXPORT":
    default:
      return 500;
  }
}

export type CreateProjectInputPayload = z.infer<typeof CreateProjectInputSchema>;
export type PatchProjectInputPayload = z.infer<typeof PatchProjectInputSchema>;
export type GraphWriteInputPayload = z.infer<typeof GraphWriteInputSchema>;
export type NodePatchInputPayload = z.infer<typeof NodePatchInputSchema>;
