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

  it("uses the revision returned by an in-flight save for newer changes", async () => {
    let resolveFirstSave!: (value: { nextRevision: number }) => void;
    const firstSave = new Promise<{ nextRevision: number }>((resolve) => { resolveFirstSave = resolve; });
    const save = vi.fn()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce({ nextRevision: 2 });
    const controller = createAutosaveController({ save });

    controller.schedule({ body: "first" }, 0);
    const firstFlush = controller.flush();
    await Promise.resolve();
    controller.schedule({ summary: "second" }, 0);
    resolveFirstSave({ nextRevision: 1 });

    await firstFlush;
    await controller.flush();

    expect(save).toHaveBeenNthCalledWith(1, { body: "first" }, 0);
    expect(save).toHaveBeenNthCalledWith(2, { summary: "second" }, 1);
  });

  it("serializes an explicit flush that arrives while another save is pending", async () => {
    let resolveFirstSave!: (value: { nextRevision: number }) => void;
    const firstSave = new Promise<{ nextRevision: number }>((resolve) => { resolveFirstSave = resolve; });
    const save = vi.fn()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce({ nextRevision: 2 });
    const controller = createAutosaveController({ save });

    controller.schedule({ body: "first" }, 0);
    const firstFlush = controller.flush();
    await Promise.resolve();
    controller.schedule({ summary: "second" }, 0);
    const secondFlush = controller.flush();

    expect(save).toHaveBeenCalledTimes(1);
    resolveFirstSave({ nextRevision: 1 });
    await Promise.all([firstFlush, secondFlush]);

    expect(save).toHaveBeenNthCalledWith(1, { body: "first" }, 0);
    expect(save).toHaveBeenNthCalledWith(2, { summary: "second" }, 1);
  });

  it("uses a newer parent revision after the controller has already saved once", async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ nextRevision: 1 })
      .mockResolvedValueOnce({ nextRevision: 3 });
    const controller = createAutosaveController({ save });

    controller.schedule({ body: "first" }, 0);
    await controller.flush();
    controller.schedule({ summary: "second" }, 2);
    await controller.flush();

    expect(save).toHaveBeenNthCalledWith(1, { body: "first" }, 0);
    expect(save).toHaveBeenNthCalledWith(2, { summary: "second" }, 2);
  });
});
