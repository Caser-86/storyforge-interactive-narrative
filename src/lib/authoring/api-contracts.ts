import { z } from "zod";
import { AuthoringError } from "./errors";
import {
  JsonValueSchema,
  ProjectSchema,
  ProjectSizeSchema,
  StoryGraphSchema,
  ValidationIssueSchema,
} from "./schemas";

export const CreateProjectInputSchema = z
  .object({
    title: z.string().trim().min(1),
    premise: z.string().trim().min(1),
    genre: z.string().trim().min(1),
    tone: z.string().trim().min(1),
    pointOfView: z.string().trim().min(1),
    rating: z.string().trim().min(1),
    size: ProjectSizeSchema,
    settingsJson: JsonValueSchema.optional(),
  })
  .strict();

export const PatchProjectInputSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    premise: z.string().trim().min(1).optional(),
    genre: z.string().trim().min(1).optional(),
    tone: z.string().trim().min(1).optional(),
    pointOfView: z.string().trim().min(1).optional(),
    rating: z.string().trim().min(1).optional(),
    size: ProjectSizeSchema.optional(),
    status: z.enum(["draft", "generating", "ready", "archived"]).optional(),
    settingsJson: JsonValueSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one editable project field is required.",
  });

export const GraphWriteInputSchema = z
  .object({
    graph: StoryGraphSchema,
    expectedRevision: z.number().int().min(0),
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

export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
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
