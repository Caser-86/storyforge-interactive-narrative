import { describe, expect, it, vi } from "vitest";
import { assertSafeBindHost } from "@/lib/authoring/local-security";

describe("authoring local security", () => {
  it("allows loopback hosts", () => {
    expect(() => assertSafeBindHost("127.0.0.1", false)).not.toThrow();
    expect(() => assertSafeBindHost("localhost", false)).not.toThrow();
    expect(() => assertSafeBindHost("::1", false)).not.toThrow();
  });

  it("denies LAN binding unless explicitly opted in", () => {
    expect(() => assertSafeBindHost("0.0.0.0", false)).toThrow(/loopback/i);
    expect(() => assertSafeBindHost("192.168.1.20", false)).toThrow(/loopback/i);
  });

  it("warns when the explicit unsafe override is used", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => assertSafeBindHost("0.0.0.0", true)).not.toThrow();
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/LAN|network|private/i));
    warning.mockRestore();
  });
});
