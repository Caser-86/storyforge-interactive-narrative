import { describe, expect, it } from "vitest";
import { mergeDraftRevision } from "@/features/authoring/editor/draft-revision";

describe("mergeDraftRevision", () => {
  it("never moves the local draft revision backwards", () => {
    expect(mergeDraftRevision(3, 2)).toBe(3);
    expect(mergeDraftRevision(3, 4)).toBe(4);
  });
});
