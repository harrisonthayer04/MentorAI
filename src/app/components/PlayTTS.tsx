"use client";
import { useState } from "react";
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

  async function handlePlay() {
    try {
      setLoading(true);
      const url = await synthesizeToUrl(text, { voiceId, modelId });
      const audio = new Audio(url);
      audio.playbackRate = Math.max(0.5, Math.min(playbackRate, 2));
      audio.play().catch(console.error);
    } catch (e) {
      console.error(e);
      alert("Audio synthesis failed. Check console.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={loading || !text?.trim()}
      className={className || "px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"}
      title="Play with ElevenLabs"
    >
      {loading ? "…" : "🔊"}
    </button>
  );
}
