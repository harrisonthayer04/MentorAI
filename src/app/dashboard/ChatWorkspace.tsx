"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import PlayTTS from "../components/PlayTTS";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  speechContent?: string | null;
  createdAt: number;
  optimistic?: boolean;
};

function parseChatApiResponse(payload: unknown): { content: string | null; speechContent: string | null; error: string | null } {
  if (typeof payload !== "object" || payload === null) {
    return { content: null, speechContent: null, error: null };
  }
  const rawContent = "content" in payload ? (payload as { content?: unknown }).content : undefined;
  const rawSpeechContent = "speechContent" in payload ? (payload as { speechContent?: unknown }).speechContent : undefined;
  const rawError = "error" in payload ? (payload as { error?: unknown }).error : undefined;
  return {
    content: typeof rawContent === "string" ? rawContent : null,
    speechContent: typeof rawSpeechContent === "string" ? rawSpeechContent : null,
    error: typeof rawError === "string" ? rawError : null,
  };
}

function parseTranscriptionResponse(payload: unknown): { text: string | null; error: string | null } {
  if (typeof payload !== "object" || payload === null) {
    return { text: null, error: null };
  }
  const rawText = "text" in payload ? (payload as { text?: unknown }).text : undefined;
  const rawError = "error" in payload ? (payload as { error?: unknown }).error : undefined;
  return {
    text: typeof rawText === "string" ? rawText : null,
    error: typeof rawError === "string" ? rawError : null,
  };
}

export default function ChatWorkspace({ threadId }: { threadId: string | null }) {
  const [modelId, setModelId] = useState<string>("gemini-2.5-flash-lite");
  const [inputValue, setInputValue] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [autoSendTranscription, setAutoSendTranscription] = useState<boolean>(true);

  const clampPlaybackRate = useCallback((rate: number) => {
    if (!Number.isFinite(rate)) return 1;
    return Math.min(1.5, Math.max(0.75, rate));
  }, []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const messageCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const stopTTSRef = useRef<(() => void) | null>(null);

  // Stop TTS when threadId changes (user leaves current chat)
  useEffect(() => {
    // Stop any currently playing audio when switching chats
    try { 
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }, [threadId]);


  const sendMessage = async (messageText?: string) => {
    if (isLoading) return;
    const text = (messageText ?? inputValue).trim();
    if (!text) return;
    if (!threadId) return; // can't send without a selected thread
    const now = Date.now();
    const tempId = `local_${now}`;
    const userMsg: ChatMessage = { id: tempId, role: "user", content: text, createdAt: now, optimistic: true };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      if (threadId) messageCacheRef.current.set(threadId, next);
      return next;
    });
    setInputValue("");

    try {
      setIsLoading(true);
      // Persist the user message on the server immediately
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: threadId, role: "user", content: text }),
          keepalive: true,
        });
        if (res.ok) {
          const payload = (await res.json()) as
            | { message: { id: string; role: "user" | "assistant"; content: string; createdAt: string } }
            | undefined;
          const saved = payload?.message;
          if (saved) {
            const normalized: ChatMessage = {
              id: saved.id,
              role: saved.role,
              content: saved.content,
              createdAt: new Date(saved.createdAt).getTime(),
            };
            setMessages((prev) => {
              const next = prev.map((msg) => (msg.id === userMsg.id ? normalized : msg));
              if (threadId) messageCacheRef.current.set(threadId, next);
              return next;
            });
          }
        }
      } catch {}

      // Trigger AI response; server will persist assistant reply
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          messages: [
            ...messages.map(({ role, content }) => ({ role, content })),
            { role: "user", content: text },
          ],
          conversationId: threadId,
        }),
        keepalive: true,
      });
      const payload: unknown = await resp.json();
      const { content: assistantContent, error: assistantError } = parseChatApiResponse(payload);
      const content = assistantContent ?? assistantError ?? "(no response)";
      // Do not append assistant locally (server will save it). Rely on polling below to render.
      if (assistantError) {
        const aiMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content,
          createdAt: Date.now(),
        };
        setMessages((prev) => {
          const next = [...prev, aiMsg];
          if (threadId) messageCacheRef.current.set(threadId, next);
          return next;
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: `Error: ${message}`,
        createdAt: Date.now(),
      };
      setMessages((prev) => {
        const next = [...prev, aiMsg];
        if (threadId) messageCacheRef.current.set(threadId, next);
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendForTranscription = useCallback(async (audioBlob: Blob) => {
    try {
      const form = new FormData();
      form.append("file", audioBlob, "clip.webm");

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload: unknown = await res.json();
      const { text, error } = parseTranscriptionResponse(payload);

      if (!res.ok) throw new Error(error || "Transcription failed");

      const transcript = (text || "").trim();
      if (!transcript) {
        return alert("No speech detected.");
      }

      // Auto-send if enabled, otherwise wait for user to click send
      if (autoSendTranscription) {
        // Pass transcript directly to sendMessage to avoid state timing issues
        await sendMessage(transcript);
      } else {
        // Set transcript in input box for manual review/editing
        setInputValue(transcript);
      }
    } catch (e) {
      console.error(e);
      alert("Transcription error. See console.");
    }
  }, [autoSendTranscription, sendMessage]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    
    // Stop TTS when user starts recording
    if (stopTTSRef.current) {
      stopTTSRef.current();
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendForTranscription(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      alert("Microphone permission denied or unavailable.");
    }
  }, [isRecording, sendForTranscription]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      mediaRecorderRef.current?.stop();
    } finally {
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage();
  };

  // Load messages for selected thread from server and poll, using an in-memory cache
  useEffect(() => {
    let cancelled = false;

    // Hydrate from cache immediately to avoid flicker
    setInputValue("");
    setIsLoading(false);
    if (!threadId) {
      setMessages([]);
      return () => {};
    }
    const cached = messageCacheRef.current.get(threadId);
    if (cached) {
      setMessages(cached);
    } else {
      setMessages([]);
    }

    const load = async () => {
      if (!threadId) return;
      try {
        const res = await fetch(`/api/messages?conversationId=${encodeURIComponent(threadId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string; speechContent?: string | null; createdAt: string }> };
        if (cancelled) return;
        const normalized = (data.messages || []).map((m) => ({ ...m, createdAt: new Date(m.createdAt).getTime() } as ChatMessage));
        setMessages((prev) => {
          const pendingLocals = prev.filter((m) => m.optimistic && m.id.startsWith("local_"));
          if (pendingLocals.length === 0) {
            messageCacheRef.current.set(threadId, normalized);
            return normalized;
          }
          const merged = [...normalized, ...pendingLocals].sort((a, b) => a.createdAt - b.createdAt);
          messageCacheRef.current.set(threadId, merged);
          return merged;
        });
      } catch {
        // ignore
      }
    };

    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [threadId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Load persisted settings
  useEffect(() => {
    try {
      const rawSpeak = localStorage.getItem("bm_speak_enabled");
      if (rawSpeak != null) setSpeakEnabled(rawSpeak === "true");
      const rawRate = localStorage.getItem("bm_playback_rate");
      if (rawRate != null) {
        const parsed = clampPlaybackRate(parseFloat(rawRate));
        setPlaybackRate(parsed);
      }
      const rawAutoSend = localStorage.getItem("bm_auto_send_transcription");
      if (rawAutoSend != null) setAutoSendTranscription(rawAutoSend === "true");
    } catch {
      // ignore
    }
  }, [clampPlaybackRate]);

  // Persist speak setting
  useEffect(() => {
    try {
      localStorage.setItem("bm_speak_enabled", String(speakEnabled));
    } catch {
      // ignore
    }
  }, [speakEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("bm_playback_rate", String(playbackRate));
    } catch {
      // ignore
    }
  }, [playbackRate]);

  useEffect(() => {
    try {
      localStorage.setItem("bm_auto_send_transcription", String(autoSendTranscription));
    } catch {
      // ignore
    }
  }, [autoSendTranscription]);

  return (
    <div className="w-full h-full">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-stretch h-full overflow-hidden">
        {/* Left: Chat box (1/4) */}
        <div className="md:col-span-3 min-h-0 h-full">
          <div className="h-full rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow flex flex-col">
            {/* Model selector */}
            <div className="p-4 border-b border-white/40 dark:border-white/10">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Model</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full rounded-xl bg-white/70 dark:bg-gray-900/40 border border-white/40 dark:border-white/10 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/40"
              >
                <option value="minimax/minimax-m2:free">MiniMax M2 Free</option>
                <option value="x-ai/grok-4-fast">Grok 4 Fast</option>
                <option value="x-ai/grok-code-fast-1">Grok Code Fast 1</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="anthropic/claude-haiku-4.5">Claude Haiku 4.5</option>
                <option value="qwen/qwen3-235b-a22b-2507">Qwen3 235B A22B 2507</option>
                <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
                <option value="deepseek/deepseek-v3.1-terminus">DeepSeek V3.1 Terminus</option>
                <option value="z-ai/glm-4.6">GLM 4.6</option>
              </select>
            </div>

            {/* Response mode toggle */}
            <div className="px-4 py-3 border-b border-white/40 dark:border-white/10">
              <div className="flex items-center justify-between">
                <label htmlFor="speak-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Audio replies
                </label>
                <button
                  id="speak-toggle"
                  role="switch"
                  aria-checked={speakEnabled}
                  onClick={() => setSpeakEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    speakEnabled ? "bg-[var(--color-brand)]" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      speakEnabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {speakEnabled ? "Assistant will speak responses" : "Assistant will reply with text only"}
              </div>
              <div className="mt-4">
                <label
                  htmlFor="speech-rate"
                  className={`text-sm font-medium flex items-center justify-between ${
                    speakEnabled ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  Playback speed
                  <span className="text-xs">{playbackRate.toFixed(2)}x</span>
                </label>
                <input
                  id="speech-rate"
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(clampPlaybackRate(parseFloat(e.target.value)))}
                  className="w-full mt-2"
                  aria-valuemin={0.75}
                  aria-valuemax={1.5}
                  aria-valuenow={playbackRate}
                  aria-label="Playback speed"
                  disabled={!speakEnabled}
                />
              </div>
            </div>

            {/* Auto-send transcription toggle */}
            <div className="px-4 py-3 border-b border-white/40 dark:border-white/10">
              <div className="flex items-center justify-between">
                <label htmlFor="auto-send-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Auto-send voice input
                </label>
                <button
                  id="auto-send-toggle"
                  role="switch"
                  aria-checked={autoSendTranscription}
                  onClick={() => setAutoSendTranscription((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoSendTranscription ? "bg-[var(--color-brand)]" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      autoSendTranscription ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {autoSendTranscription 
                  ? "Voice messages send immediately after transcription" 
                  : "Voice messages wait in the input box for manual send"}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 mt-auto">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your message
              </label>

              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                placeholder={threadId ? "Type here..." : "Create or select a conversation to start"}
                className="w-full rounded-xl bg-white/80 dark:bg-gray-900/40 border border-white/40 dark:border-white/10 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/40 resize-none"
                disabled={!threadId}
              />

              {/* Controls */}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  onTouchCancel={stopRecording}
                  disabled={!threadId}
                  className={`rounded-xl px-4 py-2 text-white ${
                    isRecording ? "bg-red-600 animate-pulse" : "bg-gray-500 hover:bg-gray-600"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={isRecording ? "Recording..." : "Hold to record"}
                >
                  {isRecording ? "Recording..." : "🎙️ Hold to Talk"}
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-[var(--color-brand)] hover:bg-[color-mix(in_oklab,var(--color-brand),black_10%)] text-white font-display font-semibold px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!threadId}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Conversation area (3/4) */}
        <div className="md:col-span-9 min-h-0 h-full">
          <ChatPanel 
            messages={messages} 
            isLoading={isLoading} 
            enableAudio={speakEnabled} 
            playbackRate={playbackRate}
            onStopTTSRef={stopTTSRef}
          />
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  messages,
  isLoading,
  enableAudio,
  playbackRate,
  onStopTTSRef,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  enableAudio: boolean;
  playbackRate: number;
  onStopTTSRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastSpokenRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const animatedMessagesRef = useRef<Set<string>>(new Set());
  const [playBlocked, setPlayBlocked] = useState<boolean>(false);
  const [showTopBlur, setShowTopBlur] = useState<boolean>(false);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const convertMathDelimiters = useCallback((input: string) => {
    return input
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => `$$${content}$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => `$${content}$`);
  }, []);

  const latestAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        // Use speechContent if available, otherwise fall back to content
        return messages[i].speechContent || messages[i].content;
      }
    }
    return "";
  }, [messages]);

  const speakWithWebSpeech = useCallback((text: string, rate: number) => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    } catch {}
  }, []);

  const stopTTS = useCallback(() => {
    try {
      // Stop audio element
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      // Stop speech synthesis
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      // Clean up URL
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
      setIsPlaying(false);
      lastSpokenRef.current = ""; // Reset so it can play again if needed
    } catch {}
  }, []);

  // Expose stopTTS function via ref
  useEffect(() => {
    if (onStopTTSRef) {
      onStopTTSRef.current = stopTTS;
    }
    return () => {
      if (onStopTTSRef) {
        onStopTTSRef.current = null;
      }
    };
  }, [stopTTS, onStopTTSRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (isAtBottom) {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
    if (el) setShowTopBlur(el.scrollTop > 0);
    
    // Reset animated messages when thread changes (messages array becomes empty)
    if (messages.length === 0) {
      animatedMessagesRef.current.clear();
    }
  }, [messages, isLoading, isAtBottom]);

  useEffect(() => {
    if (!enableAudio) return; // audio disabled
    if (typeof window === "undefined") return;
    const text = (latestAssistantText || "").trim();
    if (!text || text === lastSpokenRef.current) return;
    let revoked = false;
    const tryPlayTts = async () => {
      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, playbackRate }),
        });
        if (!resp.ok) {
          speakWithWebSpeech(text, playbackRate);
          lastSpokenRef.current = text;
          return;
        }
        const blob = await resp.blob();
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        try { audioRef.current?.pause(); } catch {}
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        const audio = new Audio();
        audio.src = url;
        audioRef.current = audio;
        audio.autoplay = true;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentUrlRef.current === url) currentUrlRef.current = null;
          setIsPlaying(false);
        };
        audio.onplay = () => setIsPlaying(true);
        audio.onpause = () => setIsPlaying(false);
        try {
          setPlayBlocked(false);
          await audio.play();
          setIsPlaying(true);
        } catch {
          setPlayBlocked(true);
          setIsPlaying(false);
        }
        audio.playbackRate = playbackRate;
        lastSpokenRef.current = text;
      } catch {
        speakWithWebSpeech(text, playbackRate);
        lastSpokenRef.current = text;
      }
    };
    tryPlayTts();
    return () => {
      revoked = true;
      setIsPlaying(false);
    };
  }, [latestAssistantText, speakWithWebSpeech, enableAudio, playbackRate]);

  // Reset playBlocked and isPlaying if audio is disabled
  useEffect(() => {
    if (!enableAudio) {
      setPlayBlocked(false);
      setIsPlaying(false);
      stopTTS();
    }
  }, [enableAudio, stopTTS]);


  // Stop TTS when component unmounts
  useEffect(() => {
    return () => {
      stopTTS();
    };
  }, [stopTTS]);

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow overflow-hidden relative">
      {showTopBlur && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 md:h-6 bg-gradient-to-b from-black/10 to-transparent dark:from-black/20 z-10" />
      )}
      {playBlocked && (
        <div className="absolute inset-0 z-10 flex items-end justify-center pb-6">
          <button
            onClick={() => {
              if (!audioRef.current) return;
              audioRef.current
                .play()
                .then(() => setPlayBlocked(false))
                .catch(() => {});
            }}
            className="rounded-xl bg-[var(--color-brand)] hover:bg-[color-mix(in_oklab,var(--color-brand),black_8%)] text-white font-display font-semibold px-4 py-2 shadow-lg border border-white/30 dark:border-white/10"
          >
            Play response
          </button>
        </div>
      )}
      {isPlaying && enableAudio && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={stopTTS}
            className="rounded-xl bg-red-500 hover:bg-red-600 text-white font-display font-semibold px-4 py-2 shadow-lg border border-white/30 dark:border-white/10 flex items-center gap-2"
            title="Stop audio playback"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            Stop
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full flex-1 overflow-y-auto p-3 md:p-4 pb-8 space-y-3"
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          setShowTopBlur(el.scrollTop > 0);
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setIsAtBottom(distanceFromBottom < 48);
        }}
      >
        {messages.map((m) => {
          const isNewMessage = !animatedMessagesRef.current.has(m.id);
          if (isNewMessage) {
            // Mark as animated (will be added to ref on next render)
            animatedMessagesRef.current.add(m.id);
          }
          
          return (
            <div
              key={m.id}
              className={`flex items-start gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              style={isNewMessage ? { animation: "fade-in-message 0.3s ease-out" } : undefined}
            >
            <div
              className={`${
                m.role === "user"
                  ? "bg-[var(--color-brand)] text-white"
                  : "bg-white/80 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 border border-white/40 dark:border-white/10"
              } max-w-[80%] rounded-2xl px-4 py-2 shadow break-words`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  p: (props) => <p className="mb-2 leading-relaxed" {...props} />,
                  ul: (props) => <ul className="list-disc ml-5 my-2 space-y-1" {...props} />,
                  ol: (props) => <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />,
                  li: (props) => <li className="leading-relaxed" {...props} />,
                  a: (props) => (
                    <a
                      className={`${m.role === "user" ? "text-white underline" : "text-blue-700 dark:text-blue-400 underline"} break-words`}
                      rel="noopener noreferrer"
                      target="_blank"
                      {...props}
                    />
                  ),
                  strong: (props) => <strong className="font-semibold" {...props} />,
                  em: (props) => <em className="italic" {...props} />,
                  code: ({ children, ...props }) => (
                    <code
                      className={`${m.role === "user" ? "bg-white/20 text-white" : "bg-black/10 dark:bg-white/10 text-inherit"} rounded px-1 py-0.5 font-mono text-[0.9em]`}
                      {...props}
                    >
                      {children}
                    </code>
                  ),
                  pre: (props) => (
                    <pre className={`${m.role === "user" ? "bg-white/15" : "bg-black/5 dark:bg-white/5"} overflow-x-auto rounded-lg p-3 my-2`} {...props} />
                  ),
                  blockquote: (props) => (
                    <blockquote className={`${m.role === "user" ? "border-white/40" : "border-black/20 dark:border-white/20"} border-l-2 pl-3 my-2 italic`} {...props} />
                  ),
                  hr: (props) => <hr className={`${m.role === "user" ? "border-white/20" : "border-black/10 dark:border-white/10"} my-3`} {...props} />,
                  table: (props) => (
                    <div className="overflow-x-auto my-2">
                      <table className="table-auto border-collapse text-sm" {...props} />
                    </div>
                  ),
                  th: (props) => <th className="border px-2 py-1" {...props} />,
                  td: (props) => <td className="border px-2 py-1 align-top" {...props} />,
                }}
              >
                {convertMathDelimiters(m.content)}
              </ReactMarkdown>
            </div>

            {m.role === "assistant" && m.content && (
            <PlayTTS
              text={m.speechContent || m.content}
              className="px-2 py-1 rounded bg-blue-600 text-white text-sm self-start"
              playbackRate={playbackRate}
            />
            )}
          </div>
        );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/80 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 border border-white/40 dark:border-white/10 max-w-[80%] rounded-2xl px-4 py-2 shadow">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}


