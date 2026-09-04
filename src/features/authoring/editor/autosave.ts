export type AutosaveState = "idle" | "saving" | "saved" | "error";

export interface AutosaveController {
  schedule(change: Record<string, string>, expectedRevision: number): void;
  flush(): Promise<void>;
  cancel(): void;
}

export type AutosaveSaveResult = {
  nextRevision?: number;
};

type AutosaveOptions = {
  save: (change: Record<string, string>, expectedRevision: number) => Promise<AutosaveSaveResult | void>;
  onStateChange?: (state: AutosaveState, error?: Error) => void;
  delayMs?: number;
};

export function createAutosaveController({ save, onStateChange, delayMs = 500 }: AutosaveOptions): AutosaveController {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingChange: Record<string, string> | null = null;
  let pendingRevision: number | null = null;
  let inFlight: Promise<void> | null = null;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  async function savePendingChanges(): Promise<void> {
    while (pendingChange !== null && pendingRevision !== null) {
      const change = pendingChange;
      const expectedRevision = pendingRevision;
      pendingChange = null;
      pendingRevision = null;
      onStateChange?.("saving");

      try {
        const result = await save(change, expectedRevision);
        if (result?.nextRevision !== undefined) {
          if (pendingChange !== null) pendingRevision = result.nextRevision;
        }
        if (pendingChange === null) {
          onStateChange?.("saved");
        } else {
          onStateChange?.("idle");
        }
      } catch (error) {
        const newerChange = pendingChange;
        const newerRevision = pendingRevision;
        pendingChange = newerChange !== null ? Object.assign({}, change, newerChange) : change;
        pendingRevision = newerRevision ?? expectedRevision;
        onStateChange?.("error", error instanceof Error ? error : new Error("Autosave failed"));
        return;
      }
    }
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (inFlight !== null) return inFlight;
    if (!pendingChange || pendingRevision === null) return;

    const current = savePendingChanges();
    inFlight = current;
    try {
      await current;
    } finally {
      if (inFlight === current) inFlight = null;
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
