import { ProviderError } from "../provider-errors";

export function schemaFailure(message: string, details?: unknown): ProviderError {
  return new ProviderError("SCHEMA", message, false, { details });
}

export function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw schemaFailure(`${label} IDs must be unique`, { values });
  }
}
