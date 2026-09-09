import { AuthoringError } from "./errors";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function parseAuthority(authority: string, protocol: string): URL | null {
  try {
    return new URL(`${protocol}//${authority}`);
  } catch {
    return null;
  }
}

function parseOrigin(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function isLoopbackUrl(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

function sameOrigin(left: URL, right: URL): boolean {
  return left.protocol === right.protocol && left.host === right.host;
}

function hasRequestBody(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength)) return parsedLength > 0;
  }
  return request.body !== null;
}

export function assertLocalWriteRequest(request: Request): void {
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/") || !WRITE_METHODS.has(method)) return;

  const requestUrl = new URL(request.url);
  const hostHeader = request.headers.get("host")?.trim();
  const requestHost = hostHeader ? parseAuthority(hostHeader, requestUrl.protocol) : requestUrl;
  if (!requestHost || !isLoopbackUrl(requestHost)) {
    throw new AuthoringError("FORBIDDEN", "仅允许本机回环地址写入 StoryForge。", { reason: "untrusted-host" });
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) {
    if (request.headers.get("x-storyforge-cli") !== "1") {
      throw new AuthoringError("FORBIDDEN", "写请求必须包含同源 Origin；命令行调用请使用受控 CLI 标记。", { reason: "missing-origin" });
    }
  } else {
    const origin = parseOrigin(originHeader);
    if (!origin || origin.pathname !== "/" || !sameOrigin(origin, requestHost)) {
      throw new AuthoringError("FORBIDDEN", "写请求来源与本地服务不匹配。", { reason: "untrusted-origin" });
    }
  }

  if (method !== "DELETE" && hasRequestBody(request)) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new AuthoringError("FORBIDDEN", "JSON 写接口只接受 application/json 请求体。", { reason: "invalid-content-type" });
    }
  }
}
