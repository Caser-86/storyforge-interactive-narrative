import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("returns the message from Error instances", () => {
    expect(getErrorMessage(new Error("disk full"), "fallback")).toBe("disk full");
  });

  it("returns string errors directly", () => {
    expect(getErrorMessage("plain failure", "fallback")).toBe("plain failure");
  });

  it("uses the fallback for non-string unknown errors", () => {
    expect(getErrorMessage({ code: "E_FAIL" }, "fallback")).toBe("fallback");
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("defaults to Unknown error when no fallback is provided", () => {
    expect(getErrorMessage({ code: "E_FAIL" })).toBe("Unknown error");
  });
});
