interface IntEnvOptions {
  min?: number;
  max?: number;
}

export function readIntEnv(name: string, fallback: number, options: IntEnvOptions = {}): number {
  const raw = process.env[name];
  if (!raw || !/^-?\d+$/.test(raw.trim())) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value)) {
    return fallback;
  }

  if (options.min !== undefined && value < options.min) {
    return fallback;
  }

  if (options.max !== undefined && value > options.max) {
    return fallback;
  }

  return value;
}
