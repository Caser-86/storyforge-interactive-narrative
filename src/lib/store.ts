import { create } from "zustand";
import type { Npc, PersistedChoice, ArtPrompt, BgmCue, Safety } from "@/lib/schemas";
import { CreateGameResponseSchema, ChoiceResponseSchema, GetSessionResponseSchema } from "@/lib/api-contracts";

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  responseSchema?: { safeParse: (d: unknown) => { success: boolean; error?: { message: string } } }
): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    const error = new Error(err.message || err.error || `Request failed (${res.status})`);
    (error as Error & { traceId?: string }).traceId = err.traceId;
    throw error;
  }
  const data = await res.json();
  if (responseSchema && process.env.NODE_ENV === "development") {
    const result = responseSchema.safeParse(data);
    if (!result.success) {
      console.error(`[API Contract] ${url} response schema mismatch:`, result.error?.message);
    }
  }
  return data as T;
}

export interface SceneData {
  id: string;
  title: string;
  location: string;
  timeOfDay: string;
  mood: string[];
  body: string;
  npcs: Npc[];
  choices: PersistedChoice[];
  artPrompt: ArtPrompt;
  bgmCue: BgmCue;
  chapterGoal: string;
  memorySummary: string;
}

export interface HistoryEntry {
  sceneId: string;
  title: string;
  choiceLabel?: string;
  choiceId?: string;
}

interface GameState {
  sessionId: string | null;
  ownerToken: string | null;
  status: "idle" | "generating" | "playing" | "error";
  currentScene: SceneData | null;
  stateDiff: Record<string, number>;
  safety: Safety | null;
  imageJobId: string | null;
  imageStatus: "none" | "queued" | "generating" | "completed" | "failed";
  imageUrl: string | null;
  history: HistoryEntry[];
  errorMessage: string | null;
  errorTraceId: string | null;
  timing: { llmMs?: number; totalMs?: number };
  selectedChoice: string | null;
  lastAction: { type: "create"; prompt: string; language: string; rating: string; options: Record<string, string> } | { type: "choice"; sceneId: string; choiceId: string } | null;

  createGame: (prompt: string, language?: string, rating?: string, options?: Record<string, string>) => Promise<void>;
  makeChoice: (sceneId: string, choiceId: string) => Promise<void>;
  pollAsset: () => Promise<void>;
  reset: () => void;
  setSelectedChoice: (id: string | null) => void;
  restoreSession: () => void;
  loadSession: (sessionId: string, ownerToken?: string | null) => Promise<void>;
  retryLast: () => Promise<void>;
}

const _PERSIST_KEYS = ["sessionId", "ownerToken"] as const;

function loadPersisted(): Pick<GameState, "sessionId" | "ownerToken"> {
  if (typeof window === "undefined") return { sessionId: null, ownerToken: null };
  try {
    const sessionId = localStorage.getItem("game_sessionId");
    const ownerToken = localStorage.getItem("game_ownerToken");
    return { sessionId: sessionId || null, ownerToken: ownerToken || null };
  } catch {
    return { sessionId: null, ownerToken: null };
  }
}

function persistState(state: Pick<GameState, "sessionId" | "ownerToken">) {
  if (typeof window === "undefined") return;
  try {
    if (state.sessionId) {
      localStorage.setItem("game_sessionId", state.sessionId);
    } else {
      localStorage.removeItem("game_sessionId");
    }
    if (state.ownerToken) {
      localStorage.setItem("game_ownerToken", state.ownerToken);
    } else {
      localStorage.removeItem("game_ownerToken");
    }
  } catch {}
}

const FALLBACK_ART_PROMPT: ArtPrompt = {
  prompt: "restored scene placeholder cinematic interactive narrative image with detailed environment and readable composition",
  negativePrompt: "",
  aspectRatio: "16:9",
  seedHint: 1,
  styleLock: "",
};

const FALLBACK_BGM_CUE: BgmCue = {
  mood: "ambient",
  bpm: 80,
  instruments: ["piano", "strings"],
  loopSeconds: 32,
  sfx: [],
  musicPrompt: "ambient background music for restored interactive narrative scene",
};

export const useGameStore = create<GameState>((set, get) => ({
  ...loadPersisted(),
  status: "idle",
  currentScene: null,
  stateDiff: {},
  safety: null,
  imageJobId: null,
  imageStatus: "none",
  imageUrl: null,
  history: [],
  errorMessage: null,
  errorTraceId: null,
  timing: {},
  selectedChoice: null,
  lastAction: null,

  createGame: async (prompt, language = "zh-CN", rating = "PG-13", options = {}) => {
    set({ status: "generating", errorMessage: null, imageUrl: null, imageStatus: "none" });
    set({ lastAction: { type: "create", prompt, language, rating, options } });

    try {
      const fingerprint = typeof window !== "undefined"
        ? localStorage.getItem("user_fingerprint") || (() => {
            const fp = crypto.randomUUID();
            localStorage.setItem("user_fingerprint", fp);
            return fp;
          })()
        : "anonymous";

      const res = await apiFetch<{
        sessionId: string;
        ownerToken: string;
        scene: SceneData;
        safety: Safety;
        assets: { imageJobId: string; imageStatus: string };
        timing: { llmMs?: number; totalMs?: number };
      }>("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-fingerprint": fingerprint },
        body: JSON.stringify({ prompt, language, rating, options }),
      }, CreateGameResponseSchema);

      const data = res;

      set({
        sessionId: data.sessionId,
        ownerToken: data.ownerToken,
        status: "playing",
        currentScene: data.scene,
        stateDiff: {},
        safety: data.safety,
        imageJobId: data.assets.imageJobId,
        imageStatus: data.assets.imageStatus as GameState["imageStatus"],
        history: [{ sceneId: data.scene.id, title: data.scene.title }],
        timing: data.timing,
      });

      persistState({ sessionId: data.sessionId, ownerToken: data.ownerToken });
      get().pollAsset();
    } catch (error) {
      set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorTraceId: (error as Error & { traceId?: string })?.traceId || null,
      });
    }
  },

  makeChoice: async (sceneId, choiceId) => {
    const { sessionId, ownerToken, currentScene, history } = get();
    if (!sessionId) return;

    set({ status: "generating", imageUrl: null, imageStatus: "none", selectedChoice: null });
    set({ lastAction: { type: "choice", sceneId, choiceId } });

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ownerToken) headers["x-owner-token"] = ownerToken;

      const data = await apiFetch<{
        scene: SceneData;
        stateDiff: Record<string, number>;
        safety: Safety;
        assets: { imageJobId: string; imageStatus: string };
        timing: { llmMs?: number; totalMs?: number };
      }>(`/api/games/${sessionId}/choices`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sceneId, choiceId }),
      }, ChoiceResponseSchema);

      const selectedChoice = currentScene?.choices.find((c) => c.id === choiceId);

      set({
        status: "playing",
        currentScene: data.scene,
        stateDiff: data.stateDiff,
        safety: data.safety,
        imageJobId: data.assets.imageJobId,
        imageStatus: data.assets.imageStatus as GameState["imageStatus"],
        history: [
          ...history.map((h, i) =>
            i === history.length - 1
              ? { ...h, choiceLabel: selectedChoice?.label, choiceId }
              : h
          ),
          { sceneId: data.scene.id, title: data.scene.title },
        ],
        timing: data.timing,
      });

      get().pollAsset();
    } catch (error) {
      set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorTraceId: (error as Error & { traceId?: string })?.traceId || null,
      });
    }
  },

  pollAsset: async () => {
    const { imageJobId, ownerToken } = get();
    if (!imageJobId) return;

    set({ imageStatus: "generating" });

    const poll = async () => {
      const currentJobId = get().imageJobId;
      if (currentJobId !== imageJobId) return;

      try {
        const headers: Record<string, string> = {};
        if (ownerToken) headers["x-owner-token"] = ownerToken;

        const res = await fetch(`/api/assets/${imageJobId}`, { headers });
        if (!res.ok) return;

        const data = await res.json();

        if (get().imageJobId !== imageJobId) return;

        if (data.status === "completed") {
          set({ imageStatus: "completed", imageUrl: data.url });
        } else if (data.status === "failed") {
          set({ imageStatus: "failed" });
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        if (get().imageJobId === imageJobId) {
          set({ imageStatus: "failed" });
        }
      }
    };

    setTimeout(poll, 1000);
  },

  reset: () => {
    set({
      sessionId: null,
      ownerToken: null,
      status: "idle",
      currentScene: null,
      stateDiff: {},
      safety: null,
      imageJobId: null,
      imageStatus: "none",
      imageUrl: null,
      history: [],
      errorMessage: null,
      errorTraceId: null,
      timing: {},
      selectedChoice: null,
      lastAction: null,
    });
    persistState({ sessionId: null, ownerToken: null });
  },

  retryLast: async () => {
    const { lastAction } = get();
    if (!lastAction) return;
    set({ status: "generating", errorMessage: null, errorTraceId: null });
    if (lastAction.type === "create") {
      const { createGame } = get();
      await createGame(lastAction.prompt, lastAction.language, lastAction.rating, lastAction.options);
    } else if (lastAction.type === "choice") {
      const { makeChoice } = get();
      await makeChoice(lastAction.sceneId, lastAction.choiceId);
    }
  },

  setSelectedChoice: (id) => {
    set({ selectedChoice: id });
  },

  restoreSession: () => {
    const persisted = loadPersisted();
    if (persisted.sessionId) {
      set({
        sessionId: persisted.sessionId,
        ownerToken: persisted.ownerToken,
      });
    }
  },

  loadSession: async (targetSessionId, token) => {
    const ownerToken = token || get().ownerToken;
    set({ status: "generating", errorMessage: null, lastAction: null });

    try {
      const headers: Record<string, string> = {};
      if (ownerToken) headers["x-owner-token"] = ownerToken;

      const data = await apiFetch<{
        session: { currentSceneId?: string; [k: string]: unknown };
        scenes: Array<{
          id?: string; turn?: number; title?: string;
          location?: string; timeOfDay?: string; time_of_day?: string;
          mood?: string[]; body?: string; memorySummary?: string; memory_summary?: string;
          npcs?: Npc[]; choices?: PersistedChoice[];
          artPrompt?: ArtPrompt; bgmCue?: BgmCue;
          chapterGoal?: string; chapter_goal?: string;
          choiceLabel?: string; choice_label?: string;
        }>;
        assets?: { imageJobId?: string; imageStatus?: string; imageUrl?: string };
      }>(`/api/games/${targetSessionId}`, { headers }, GetSessionResponseSchema);
      const session = data.session;
      const scenes = data.scenes || [];

      const lastScene = scenes.length > 0 ? scenes[scenes.length - 1] : null;

      const currentScene: SceneData | null = lastScene
        ? {
            id: lastScene.id || session.currentSceneId || "",
            title: lastScene.title || "继续冒险",
            location: lastScene.location || "未知",
            timeOfDay: lastScene.timeOfDay || lastScene.time_of_day || "未知",
            mood: lastScene.mood || [],
            body: lastScene.body || lastScene.memorySummary || lastScene.memory_summary || "",
            npcs: Array.isArray(lastScene.npcs) ? lastScene.npcs : [],
            choices: Array.isArray(lastScene.choices) ? lastScene.choices : [],
            artPrompt: lastScene.artPrompt || FALLBACK_ART_PROMPT,
            bgmCue: lastScene.bgmCue || FALLBACK_BGM_CUE,
            chapterGoal: lastScene.chapterGoal || lastScene.chapter_goal || "",
            memorySummary: lastScene.memorySummary || lastScene.memory_summary || "",
          }
        : null;

      const history: HistoryEntry[] = scenes.map((s: { id?: string; turn?: number; title?: string; choiceLabel?: string; choice_label?: string }) => ({
        sceneId: s.id || s.turn?.toString() || "",
        title: s.title || "",
        choiceLabel: s.choiceLabel || s.choice_label,
      }));

      const imageJobId = data.assets?.imageJobId || null;
      const imageStatus = (data.assets?.imageStatus || "none") as GameState["imageStatus"];

      set({
        sessionId: targetSessionId,
        ownerToken,
        status: currentScene ? "playing" : "idle",
        currentScene,
        stateDiff: {},
        safety: null,
        imageJobId,
        imageStatus,
        imageUrl: data.assets?.imageUrl || null,
        history,
        errorMessage: null,
        errorTraceId: null,
        timing: {},
      });

      persistState({ sessionId: targetSessionId, ownerToken });
      if (imageJobId && (imageStatus === "queued" || imageStatus === "generating")) {
        get().pollAsset();
      }
    } catch (error) {
      set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Failed to load session",
        errorTraceId: null,
      });
    }
  },
}));
