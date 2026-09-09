import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/authoring/api-contracts";
import { assertLocalWriteRequest } from "@/lib/authoring/request-security";

function contentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + (isDevelopment ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'" + (isDevelopment ? " ws: wss:" : ""),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export default async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  let response: Response;
  try {
    assertLocalWriteRequest(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } catch (error) {
    response = errorResponse(error);
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production"));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
