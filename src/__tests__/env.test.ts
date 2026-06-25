import { afterEach, describe, expect, it } from "vitest";
import { readIntEnv } from "@/lib/env";

const originalEnv = { ...process.env };

describe("readIntEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses the fallback for missing, empty, or invalid values", () => {
    delete process.env.TEST_INT;
    expect(readIntEnv("TEST_INT", 42)).toBe(42);

    process.env.TEST_INT = "";
    expect(readIntEnv("TEST_INT", 42)).toBe(42);

    process.env.TEST_INT = "not-a-number";
    expect(readIntEnv("TEST_INT", 42)).toBe(42);
  });

  it("returns integer values and rejects partial numeric strings", () => {
    process.env.TEST_INT = "120000";
    expect(readIntEnv("TEST_INT", 42)).toBe(120000);

    process.env.TEST_INT = "12seconds";
    expect(readIntEnv("TEST_INT", 42)).toBe(42);
  });

  it("enforces optional bounds after parsing", () => {
    process.env.TEST_INT = "-5";
    expect(readIntEnv("TEST_INT", 42, { min: 1 })).toBe(42);

    process.env.TEST_INT = "999";
    expect(readIntEnv("TEST_INT", 42, { max: 100 })).toBe(42);
  });
});
