"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { matchBgmLoop } from "@/lib/bgm-service";
import type { BgmCue } from "@/lib/schemas";

interface BgmPlayerProps {
  bgmCue: BgmCue;
}

function BgmPlayerInner({ bgmCue, matchedLoop, canPlay }: {
  bgmCue: BgmCue;
  matchedLoop: NonNullable<ReturnType<typeof matchBgmLoop>["loop"]> | null;
  canPlay: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlay = useCallback(() => {
    if (!matchedLoop?.fileUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(matchedLoop.fileUrl);
      audioRef.current.loop = true;
      audioRef.current.volume = volume;
      audioRef.current.onerror = () => {
        setAudioError(true);
        setPlaying(false);
      };
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        setPlaying(false);
      });
      setPlaying(true);
    }
  }, [playing, matchedLoop, volume]);

  return (
    <div className="bg-[#1a1a2e]/80 border border-[#333] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">BGM 播放器</span>
        {matchedLoop && (
          <span className="text-xs text-gray-300">{matchedLoop.title}</span>
        )}
      </div>

      {matchedLoop && canPlay ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                playing
                  ? "bg-[#e94560] text-white"
                  : "bg-[#333] text-gray-300 hover:bg-[#444]"
              }`}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <div className="flex-1">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-1 accent-[#e94560]"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>音量</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {matchedLoop.instruments.map((inst, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded bg-[#0f3460]/50 text-blue-300"
              >
                {inst}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>BPM: {matchedLoop.bpm}</span>
            <span>·</span>
            <span>循环: {matchedLoop.loopSeconds}s</span>
            <span>·</span>
            <span>调性: {matchedLoop.key}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {matchedLoop && !matchedLoop.available
              ? `已匹配「${matchedLoop.title}」，音频资源待补充`
              : audioError
              ? "音频加载失败"
              : "未匹配到预设 BGM"}
          </p>
          {matchedLoop && !matchedLoop.available && (
            <div className="flex flex-wrap gap-1">
              {matchedLoop.instruments.map((inst, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded bg-[#0f3460]/50 text-blue-300"
                >
                  {inst}
                </span>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-[#333]">
            <p className="text-xs text-gray-400 mb-1">音乐 Prompt（可复制）</p>
            <p className="text-xs text-gray-300 italic">{bgmCue.musicPrompt}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BgmPlayer({ bgmCue }: BgmPlayerProps) {
  const matchResult = useMemo(() => matchBgmLoop(bgmCue), [bgmCue]);
  const matchedLoop = matchResult.matched ? matchResult.loop ?? null : null;
  const canPlay = !!(matchedLoop?.available && matchedLoop.fileUrl);

  return (
    <BgmPlayerInner
      key={bgmCue.musicPrompt}
      bgmCue={bgmCue}
      matchedLoop={matchedLoop}
      canPlay={canPlay}
    />
  );
}
