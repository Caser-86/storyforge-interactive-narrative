import { describe, expect, it } from "vitest";
import { parseInteractiveEvaluationOptions } from "@/scripts/interactive-evaluate";

describe("interactive evaluation CLI", () => {
  it("keeps live evaluation in dry-run mode by default", () => {
    expect(parseInteractiveEvaluationOptions(["--provider", "live", "--dry-run"])).toMatchObject({
      provider: "live",
      dryRun: true,
      allowNetwork: false,
      approvePaidCalls: false,
    });
  });

  it("requires explicit network, paid-call, and fixture gates for live evaluation", () => {
    expect(() => parseInteractiveEvaluationOptions(["--provider", "live"])).toThrow("dry-run");
    expect(() => parseInteractiveEvaluationOptions(["--provider", "live", "--allow-network"])).toThrow("approve-paid-calls");
    expect(() => parseInteractiveEvaluationOptions(["--provider", "live", "--allow-network", "--approve-paid-calls"])).toThrow("--fixture");
  });

  it("accepts one explicitly selected fixture for an approved live run", () => {
    expect(parseInteractiveEvaluationOptions([
      "--provider", "live",
      "--allow-network",
      "--approve-paid-calls",
      "--fixture", "zh-contemporary-6",
    ])).toMatchObject({
      provider: "live",
      dryRun: false,
      allowNetwork: true,
      approvePaidCalls: true,
      fixtureId: "zh-contemporary-6",
    });
  });

  it("rejects unknown providers, flags, and fixture IDs", () => {
    expect(() => parseInteractiveEvaluationOptions(["--provider", "unknown"])).toThrow("fake or live");
    expect(() => parseInteractiveEvaluationOptions(["--provider", "live", "--dry-run", "--unknown"])).toThrow("Unknown option");
    expect(() => parseInteractiveEvaluationOptions([
      "--provider", "live",
      "--allow-network",
      "--approve-paid-calls",
      "--fixture", "missing",
    ], ["zh-contemporary-6", "zh-fantasy-8", "zh-suspense-16"])).toThrow("Unknown interactive fixture");
  });
});
