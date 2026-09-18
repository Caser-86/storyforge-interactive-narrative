export function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|ark)-[A-Za-z0-9_-]+\b/gi, "$1-[redacted]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s/]+:[^\s/@]+@/gi, "[redacted]@");
}

export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) {
    return redactSensitiveText(error.message);
  }

  if (typeof error === "string") {
    return redactSensitiveText(error);
  }

  return fallback;
}
