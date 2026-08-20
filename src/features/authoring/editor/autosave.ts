export type AutosaveState = "idle" | "saving" | "saved" | "error";

export interface AutosaveController {
  schedule(change: Record<string, string>, expectedRevision: number): void;
  flush(): Promise<void>;
  cancel(): void;
}

type AutosaveOptions = {
  save: (change: Record<string, string>, expectedRevision: number) => Promise<unknown>;
  onStateChange?: (state: AutosaveState, error?: Error) => void;
  delayMs?: number;
};

export function createAutosaveController({ save, onStateChange, delayMs = 500 }: AutosaveOptions): AutosaveController {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingChange: Record<string, string> | null = null;
  let pendingRevision: number | null = null;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (!pendingChange || pendingRevision === null) return;

    const change = pendingChange;
    const expectedRevision = pendingRevision;
    pendingChange = null;
    pendingRevision = null;
    onStateChange?.("saving");

    try {
      await save(change, expectedRevision);
      onStateChange?.("saved");
    } catch (error) {
      const newerChange = pendingChange;
      if (newerChange !== null) {
        pendingChange = Object.assign({}, change, newerChange);
      } else {
        pendingChange = change;
        pendingRevision = expectedRevision;
      }
      onStateChange?.("error", error instanceof Error ? error : new Error("Autosave failed"));
    }
  }

  return {
    schedule(change, expectedRevision) {
      pendingChange = { ...(pendingChange ?? {}), ...change };
      pendingRevision ??= expectedRevision;
      clearTimer();
      timer = setTimeout(() => {
        void flush().catch(() => undefined);
      }, delayMs);
      onStateChange?.("idle");
    },
    flush,
    cancel() {
      clearTimer();
      pendingChange = null;
      pendingRevision = null;
    },
  };
}
