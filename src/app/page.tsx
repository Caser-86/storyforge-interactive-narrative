"use client";

import { useState, useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import StartScreen from "./components/StartScreen";
import LoadingScreen from "./components/LoadingScreen";
import ErrorScreen from "./components/ErrorScreen";
import StoryPanel from "./components/StoryPanel";
import VisualPanel from "./components/VisualPanel";
import StatusPanel from "./components/StatusPanel";

type MobileTab = "story" | "visual" | "status";

export default function Home() {
  const { status, currentScene, sessionId, imageJobId, pollAsset, restoreSession } = useGameStore();
  const [mobileTab, setMobileTab] = useState<MobileTab>("story");
  const prevSceneIdRef = useRef<string | null>(null);
  const mobileTabs: MobileTab[] = imageJobId ? ["story", "visual", "status"] : ["story", "status"];
  const activeMobileTab = !imageJobId && mobileTab === "visual" ? "story" : mobileTab;

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const currentSceneId = currentScene?.id ?? null;

  useEffect(() => {
    if (currentSceneId !== prevSceneIdRef.current) {
      prevSceneIdRef.current = currentSceneId;
      useGameStore.getState().setSelectedChoice(null);
    }
  }, [currentSceneId]);

  useEffect(() => {
    if (!sessionId) return;
    if (!imageJobId) return;

    const connectSSE = async () => {
      try {
        const ownerToken = useGameStore.getState().ownerToken;
        if (!ownerToken) return undefined;

        const tokenRes = await fetch(`/api/games/${sessionId}/events-token`, {
          method: "POST",
          headers: { "x-owner-token": ownerToken },
        });

        if (!tokenRes.ok) return undefined;

        const { streamToken } = await tokenRes.json();
        if (!streamToken) return undefined;

        const es = new EventSource(`/api/games/${sessionId}/events?streamToken=${streamToken}`);

        es.addEventListener("asset.completed", (e) => {
          const data = JSON.parse(e.data);
          const currentJobId = useGameStore.getState().imageJobId;
          if (data.assetJobId && data.assetJobId !== currentJobId) return;
          useGameStore.setState({
            imageStatus: "completed",
            imageUrl: data.url,
          });
        });

        es.addEventListener("asset.failed", (e) => {
          const data = JSON.parse(e.data);
          const currentJobId = useGameStore.getState().imageJobId;
          if (data.assetJobId && data.assetJobId !== currentJobId) return;
          useGameStore.setState({ imageStatus: "failed" });
        });

        es.addEventListener("asset.updated", (e) => {
          const data = JSON.parse(e.data);
          const currentJobId = useGameStore.getState().imageJobId;
          if (data.assetJobId && data.assetJobId !== currentJobId) return;
          if (data.status === "generating") {
            useGameStore.setState({ imageStatus: "generating" });
          }
        });

        es.onerror = () => {
          es.close();
          const retryTimer = setTimeout(() => {
            connectSSE().then((fn) => {
              if (fn) cleanup = fn;
            });
          }, 5000);
          const prevCleanup = cleanup;
          cleanup = () => {
            clearTimeout(retryTimer);
            prevCleanup?.();
          };
        };

        return () => {
          es.close();
        };
      } catch {
        return undefined;
      }
    };

    let cleanup: (() => void) | undefined;

    connectSSE().then((fn) => {
      if (fn) {
        cleanup = fn;
      } else {
        const interval = setInterval(() => {
          pollAsset();
        }, 3000);
        cleanup = () => clearInterval(interval);
      }
    });

    return () => {
      cleanup?.();
    };
  }, [sessionId, imageJobId, pollAsset]);

  if (status === "idle") {
    return <StartScreen />;
  }

  if (status === "generating" && !currentScene) {
    return <LoadingScreen />;
  }

  if (status === "error") {
    return <ErrorScreen />;
  }

  if (currentScene) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
        <div className="hidden lg:flex min-h-screen">
          <div className={`${imageJobId ? "flex-1" : "flex-1 max-w-4xl mx-auto"} p-8 overflow-y-auto`}>
            <StoryPanel />
          </div>
          {imageJobId ? (
            <div className="w-[420px] p-8 border-l border-[#333] overflow-y-auto">
              <VisualPanel />
            </div>
          ) : null}
        </div>

        <div className="lg:hidden flex flex-col min-h-screen" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex border-b border-[#333] bg-[#0a0a1a]/80 sticky top-0 z-10">
            {mobileTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeMobileTab === tab
                    ? "text-[#e94560] border-b-2 border-[#e94560]"
                    : "text-gray-400"
                }`}
              >
                {tab === "story" ? "故事" : tab === "visual" ? "画面" : "状态"}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4 overflow-y-auto">
            {activeMobileTab === "story" && <StoryPanel />}
            {activeMobileTab === "visual" && <VisualPanel />}
            {activeMobileTab === "status" && <StatusPanel />}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
