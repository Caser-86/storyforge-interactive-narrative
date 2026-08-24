import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutosaveController } from "@/features/authoring/editor/autosave";

describe("createAutosaveController", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces changes and merges fields before saving", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = createAutosaveController({ save });
    controller.schedule({ body: "first" }, 2);
    controller.schedule({ summary: "short" }, 2);
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledWith({ body: "first", summary: "short" }, 2);
  });

  it("flushes immediately and keeps the pending change after an offline error", async () => {
    const states: string[] = [];
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const controller = createAutosaveController({ save, onStateChange: (state) => states.push(state) });
    controller.schedule({ body: "draft" }, 1);
    await controller.flush();
    expect(states).toContain("error");
    await controller.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
