import { create } from "zustand";
import type { Npc, Choice, ArtPrompt, BgmCue, Safety } from "@/lib/schemas";

export interface SceneData {
  id: string;
  title: string;
  location: string;
  timeOfDay: string;
  mood: string[];
  body: string;
  npcs: Npc[];
  choices: Choice[];
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
  status: "idle" | "generating" | "playing" | "error";
  currentScene: SceneData | null;
  stateDiff: Record<string, number>;
  safety: Safety | null;
  imageJobId: string | null;
  imageStatus: "none" | "queued" | "generating" | "completed" | "failed";
  imageUrl: string | null;
  history: HistoryEntry[];
  errorMessage: string | null;
  timing: { llmMs?: number; totalMs?: number };

  createGame: (prompt: string, language?: string, rating?: string, options?: Record<string, string>) => Promise<void>;
  makeChoice: (sceneId: string, choiceId: string) => Promise<void>;
  pollAsset: () => Promise<void>;
  reset: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  sessionId: null,
  status: "idle",
  currentScene: null,
  stateDiff: {},
  safety: null,
  imageJobId: null,
  imageStatus: "none",
  imageUrl: null,
  history: [],
  errorMessage: null,
  timing: {},

  createGame: async (prompt, language = "zh-CN", rating = "PG-13", options = {}) => {
    set({ status: "generating", errorMessage: null, imageUrl: null, imageStatus: "none" });

    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, language, rating, options }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create game");
      }

      const data = await res.json();

      set({
        sessionId: data.sessionId,
        status: "playing",
        currentScene: data.scene,
        stateDiff: {},
        safety: data.safety,
        imageJobId: data.assets.imageJobId,
        imageStatus: data.assets.imageStatus,
        history: [{ sceneId: data.scene.id, title: data.scene.title }],
        timing: data.timing,
      });

      get().pollAsset();
    } catch (error) {
      set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  makeChoice: async (sceneId, choiceId) => {
    const { sessionId, currentScene, history } = get();
    if (!sessionId) return;

    set({ status: "generating", imageUrl: null, imageStatus: "none" });

    try {
      const res = await fetch(`/api/games/${sessionId}/choices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId, choiceId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to make choice");
      }

      const data = await res.json();

      const selectedChoice = currentScene?.choices.find((c) => c.id === choiceId);

      set({
        status: "playing",
        currentScene: data.scene,
        stateDiff: data.stateDiff,
        safety: data.safety,
        imageJobId: data.assets.imageJobId,
        imageStatus: data.assets.imageStatus,
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
      });
    }
  },

  pollAsset: async () => {
    const { imageJobId } = get();
    if (!imageJobId) return;

    set({ imageStatus: "generating" });

    const poll = async () => {
      try {
        const res = await fetch(`/api/assets/${imageJobId}`);
        if (!res.ok) return;

        const data = await res.json();

        if (data.status === "completed") {
          set({ imageStatus: "completed", imageUrl: data.url });
        } else if (data.status === "failed") {
          set({ imageStatus: "failed" });
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        set({ imageStatus: "failed" });
      }
    };

    setTimeout(poll, 1000);
  },

  reset: () => {
    set({
      sessionId: null,
      status: "idle",
      currentScene: null,
      stateDiff: {},
      safety: null,
      imageJobId: null,
      imageStatus: "none",
      imageUrl: null,
      history: [],
      errorMessage: null,
      timing: {},
    });
  },
}));
