import { loadEnvConfig } from "@next/env";

let loaded = false;

export function loadAuthoringEnv(): void {
  if (loaded) return;
  loadEnvConfig(process.cwd(), true, { info: () => undefined, error: () => undefined });
  loaded = true;
}
