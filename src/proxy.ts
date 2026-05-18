import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL || "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, x-owner-token, x-user-fingerprint");
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  if (request.method === "POST" && request.nextUrl.pathname.startsWith("/api/games")) {
    try {
      const fingerprint = request.headers.get("x-user-fingerprint");
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
      const rateLimitKey = fingerprint || ip;

      const { checkRateLimit } = await import("./lib/rate-limit");
      const { allowed, reason } = await checkRateLimit(rateLimitKey, ip);

      if (!allowed) {
        const traceId = Math.random().toString(36).slice(2, 14);
        return NextResponse.json(
          { code: "RATE_LIMIT", message: reason || "Rate limit exceeded", traceId, retryAfter: 60 },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }
    } catch {
      // rate limit check failed, allow request through
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
