import { NextResponse } from "next/server";
import { getOrCreateUser, getUserGames, updateUserNickname, deleteUser } from "@/lib/user-service";
import { apiError, ErrorCodes } from "@/lib/api-errors";

function requireFingerprint(request: Request): string | null {
  const fp = request.headers.get("x-user-fingerprint");
  if (!fp || fp === "anonymous") return null;
  return fp;
}

export async function GET(request: Request) {
  try {
    const fingerprint = requireFingerprint(request);
    if (!fingerprint) {
      return apiError(ErrorCodes.VALIDATION, "x-user-fingerprint header is required", 400);
    }
    const user = await getOrCreateUser(fingerprint);
    const games = await getUserGames(user.id);

    return NextResponse.json({ user, games });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return apiError(ErrorCodes.INTERNAL, message, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const fingerprint = requireFingerprint(request);
    if (!fingerprint) {
      return apiError(ErrorCodes.VALIDATION, "x-user-fingerprint header is required", 400);
    }
    const user = await getOrCreateUser(fingerprint);
    const body = await request.json();

    if (body.nickname) {
      await updateUserNickname(user.id, body.nickname);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return apiError(ErrorCodes.INTERNAL, message, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const fingerprint = requireFingerprint(request);
    if (!fingerprint) {
      return apiError(ErrorCodes.VALIDATION, "x-user-fingerprint header is required", 400);
    }
    const user = await getOrCreateUser(fingerprint);
    await deleteUser(user.id);

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return apiError(ErrorCodes.INTERNAL, message, 500);
  }
}
