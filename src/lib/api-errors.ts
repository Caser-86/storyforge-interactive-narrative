import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export interface ApiError {
  code: string;
  message: string;
  traceId: string;
}

export function apiError(
  code: string,
  message: string,
  status: number = 500
): NextResponse<ApiError> {
  const traceId = uuidv4().replace(/-/g, "").slice(0, 12);
  console.error(`[API Error] ${code}: ${message} (trace: ${traceId})`);
  return NextResponse.json({ code, message, traceId }, { status });
}

export const ErrorCodes = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  RATE_LIMIT: "RATE_LIMIT",
  SESSION_INACTIVE: "SESSION_INACTIVE",
  DUPLICATE: "DUPLICATE",
  LLM_FAILURE: "LLM_FAILURE",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL",
} as const;
