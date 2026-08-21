import { AuthoringError } from "./errors";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertSafeBindHost(host: string, allowUnsafe: boolean): void {
  const normalized = host.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized)) return;
  if (allowUnsafe) {
    console.warn(`StoryForge is listening on a non-loopback host (${host}). LAN access exposes private stories and API configuration.`);
    return;
  }
  throw new AuthoringError("VALIDATION", `StoryForge must bind to a loopback host, received ${host}`);
}
