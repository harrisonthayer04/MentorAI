"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { synthesizeToUrl } from "@/lib/tts";

export default function PlayTTS({
  text,
  voiceId,
  modelId,
  className,
  playbackRate = 1,
}: {
  text: string;
  voiceId?: string;
  modelId?: string;
  className?: string;
  playbackRate?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  const handlePlay = useCallback(async () => {
    // If already playing, stop it
    if (isPlaying && audioRef.current) {
      handleStop();
      return;
    }

    try {
      setLoading(true);
      const url = await synthesizeToUrl(text, { voiceId, modelId });
      
      // Clean up previous URL if exists
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
      urlRef.current = url;
      
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = Math.max(0.5, Math.min(playbackRate, 2));
      
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => {
        setIsPlaying(false);
        // Clean up URL after playback
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setLoading(false);
      };
      
      await audio.play();
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [text, voiceId, modelId, playbackRate, isPlaying, handleStop]);

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={loading || !text?.trim()}
      className={className || "px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"}
      title={isPlaying ? "Stop playback" : "Play with ElevenLabs"}
    >
      {loading ? (
        <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
        </svg>
      ) : isPlaying ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}
