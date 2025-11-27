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

type DebugLogEntry = {
  timestamp: string;
  scope: string;
  detail: string;
};

function normalizeDebugLog(raw: unknown): DebugLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { timestamp?: unknown }).timestamp === "string" &&
        typeof (entry as { scope?: unknown }).scope === "string" &&
        typeof (entry as { detail?: unknown }).detail === "string"
      ) {
        return {
          timestamp: (entry as { timestamp: string }).timestamp,
          scope: (entry as { scope: string }).scope,
          detail: (entry as { detail: string }).detail,
        };
      }
      return null;
    })
    .filter((entry): entry is DebugLogEntry => Boolean(entry));
}

function parseChatApiResponse(payload: unknown): {
  content: string | null;
  speechContent: string | null;
  error: string | null;
  debugLog: DebugLogEntry[];
} {
  if (typeof payload !== "object" || payload === null) {
    return { content: null, speechContent: null, error: null, debugLog: [] };
  }
  const rawContent = "content" in payload ? (payload as { content?: unknown }).content : undefined;
  const rawSpeechContent = "speechContent" in payload ? (payload as { speechContent?: unknown }).speechContent : undefined;
  const rawError = "error" in payload ? (payload as { error?: unknown }).error : undefined;
  const rawDebug = "debugLog" in payload ? (payload as { debugLog?: unknown }).debugLog : undefined;
  return {
    content: typeof rawContent === "string" ? rawContent : null,
    speechContent: typeof rawSpeechContent === "string" ? rawSpeechContent : null,
    error: typeof rawError === "string" ? rawError : null,
    debugLog: normalizeDebugLog(rawDebug),
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

const DEBUG_STORAGE_KEY = "bm_debug_mode";
const DEBUG_EVENT_NAME = "bm_debug_mode_changed";

export default function ChatWorkspace({ threadId }: { threadId: string | null }) {
  const [modelId, setModelId] = useState<string>("gemini-2.5-flash-lite");
  const [imageModelId, setImageModelId] = useState<string>("google/gemini-2.5-flash-image");
  const [inputValue, setInputValue] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [autoSendTranscription, setAutoSendTranscription] = useState<boolean>(true);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);
  const debugLogsRef = useRef<Map<string, DebugLogEntry[]>>(new Map());
  const [debugLogVersion, setDebugLogVersion] = useState<number>(0);
  const hydratedThreadsRef = useRef<Set<string>>(new Set());

  const clampPlaybackRate = useCallback((rate: number) => {
    if (!Number.isFinite(rate)) return 1;
    return Math.min(1.5, Math.max(0.75, rate));
  }, []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const messageCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const stopTTSRef = useRef<(() => void) | null>(null);

  const appendDebugLogs = useCallback(
    (targetThreadId: string, entries: DebugLogEntry[]) => {
      if (!targetThreadId || entries.length === 0) return;
      const existing = debugLogsRef.current.get(targetThreadId) ?? [];
      debugLogsRef.current.set(targetThreadId, [...existing, ...entries]);
      setDebugLogVersion((v) => v + 1);
    },
    []
  );

  const addLocalDebugEntry = useCallback(
    (scope: string, detail: string, conversationOverride?: string) => {
      const targetId = conversationOverride ?? threadId;
      if (!debugMode || !targetId) return;
      appendDebugLogs(targetId, [{ timestamp: new Date().toISOString(), scope, detail }]);
    },
    [appendDebugLogs, debugMode, threadId]
  );

  const currentLogCount = useMemo(() => {
    if (!threadId) return 0;
    return debugLogsRef.current.get(threadId)?.length ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, debugLogVersion]);

  const handleDownloadLogs = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!threadId) {
      alert("Select a conversation to download logs.");
      return;
    }
    const logs = debugLogsRef.current.get(threadId);
    if (!logs || logs.length === 0) {
      alert("No logs available for this conversation yet.");
      return;
    }
    const lines = logs.map((entry) => {
      const ts = new Date(entry.timestamp).toLocaleString();
      return `[${ts}] [${entry.scope}] ${entry.detail}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mentorai-chat-log-${threadId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [threadId]);

  // Sync debug mode preference from Settings/localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const readPreference = () => {
      try {
        const stored = localStorage.getItem(DEBUG_STORAGE_KEY);
        setDebugMode(stored === "true");
      } catch {
        setDebugMode(false);
      }
    };
    readPreference();
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") {
        setDebugMode(detail.enabled);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DEBUG_STORAGE_KEY) {
        readPreference();
      }
    };
    window.addEventListener(DEBUG_EVENT_NAME, handleCustom);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DEBUG_EVENT_NAME, handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Hydrate existing messages into the debug log once per thread when debug mode is enabled
  useEffect(() => {
    if (!debugMode || !threadId) return;
    if (hydratedThreadsRef.current.has(threadId)) return;
    if (messages.length === 0) return;
    const entries: DebugLogEntry[] = messages.map((m) => ({
      timestamp: new Date(m.createdAt).toISOString(),
      scope: m.role === "user" ? "user_message" : "assistant_message",
      detail: m.content,
    }));
    appendDebugLogs(threadId, entries);
    hydratedThreadsRef.current.add(threadId);
  }, [appendDebugLogs, debugMode, messages, threadId]);

  // Stop TTS when threadId changes
  useEffect(() => {
    try { 
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }, [threadId]);

  const sendMessage = useCallback(async (messageText?: string) => {
    if (isLoading) return;
    const text = (messageText ?? inputValue).trim();
    if (!text) return;
    if (!threadId) return;
    const targetThreadId = threadId;
    addLocalDebugEntry("client", `User message sent: ${text}`, targetThreadId);
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

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          imageModelId,
          messages: [
            ...messages.map(({ role, content }) => ({ role, content })),
            { role: "user", content: text },
          ],
          conversationId: threadId,
          debug: debugMode,
        }),
        keepalive: true,
      });
      const payload: unknown = await resp.json();
      const { content: assistantContent, error: assistantError, debugLog } = parseChatApiResponse(payload);
      if (targetThreadId && debugLog.length > 0) {
        appendDebugLogs(targetThreadId, debugLog);
      }
      const content = assistantContent ?? assistantError ?? "(no response)";
      if (assistantError) {
        addLocalDebugEntry("server_error", assistantError, targetThreadId);
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
      addLocalDebugEntry("client_error", message, targetThreadId);
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
  }, [isLoading, inputValue, threadId, addLocalDebugEntry, modelId, imageModelId, messages, debugMode, appendDebugLogs]);

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

      if (autoSendTranscription) {
        await sendMessage(transcript);
      } else {
        setInputValue(transcript);
      }
    } catch (e) {
      console.error(e);
      alert("Transcription error. See console.");
    }
  }, [autoSendTranscription, sendMessage]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    
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

  // Load messages for selected thread from server
  useEffect(() => {
    let cancelled = false;
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
    if (e.key === "Enter" && !e.shiftKey) {
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
    <div className="flex flex-col h-full">
      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel 
          messages={messages} 
          isLoading={isLoading} 
          enableAudio={speakEnabled} 
          playbackRate={playbackRate}
          onStopTTSRef={stopTTSRef}
        />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]/80 backdrop-blur-sm">
        <div className="px-4 md:px-8 lg:px-12 py-4">
          {/* Settings toggle row */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              Chat settings
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                className={`transition-transform ${showSettings ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            
            <div className="flex items-center gap-4">
              {/* Audio toggle */}
              <button
                onClick={() => setSpeakEnabled(!speakEnabled)}
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: speakEnabled ? 'var(--color-brand)' : 'var(--color-text-muted)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {speakEnabled && (
                    <>
                      <path d="M19.07 4.93a10 10 0 010 14.14" />
                      <path d="M15.54 8.46a5 5 0 010 7.07" />
                    </>
                  )}
                </svg>
                Audio {speakEnabled ? "on" : "off"}
              </button>
            </div>
          </div>

          {/* Collapsible settings panel */}
          {showSettings && (
            <div className="mb-4 p-4 rounded-xl bg-[var(--color-surface-elevated)]/60 border border-[var(--color-border)] space-y-4 overflow-hidden" style={{ animation: "slide-down-expand 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}>
              {/* Model selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Chat Model</label>
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/50"
                  >
                    <option value="minimax/minimax-m2:free">MiniMax M2 Free</option>
                    <option value="x-ai/grok-4-fast">Grok 4 Fast</option>
                    <option value="x-ai/grok-code-fast-1">Grok Code Fast 1</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                    <option value="gemini-3-pro">Gemini 3 Pro</option>
                    <option value="anthropic/claude-opus-4.5">Claude Opus 4.5</option>
                    <option value="anthropic/claude-sonnet-4.5">Claude Sonnet 4.5</option>
                    <option value="anthropic/claude-haiku-4.5">Claude Haiku 4.5</option>
                    <option value="moonshot/kimi-k2-thinking">Kimi K2 Thinking</option>
                    <option value="qwen/qwen3-235b-a22b-2507">Qwen3 235B A22B 2507</option>
                    <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
                    <option value="deepseek/deepseek-v3.1-terminus">DeepSeek V3.1 Terminus</option>
                    <option value="z-ai/glm-4.6">GLM 4.6</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Image Model</label>
                  <select
                    value={imageModelId}
                    onChange={(e) => setImageModelId(e.target.value)}
                    className="w-full rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/50"
                  >
                    <option value="google/gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                    <option value="google/gemini-3-pro-image-preview">Gemini 3 Pro Image Preview</option>
                    <option value="openai/gpt-5-image">GPT-5 Image</option>
                    <option value="black-forest-labs/flux.2-pro">FLUX.2 Pro</option>
                  </select>
                </div>
              </div>

              {/* Audio settings */}
              <div className="pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-secondary)]">Playback speed</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{playbackRate.toFixed(2)}x</div>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.5"
                    step="0.05"
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(clampPlaybackRate(parseFloat(e.target.value)))}
                    className="w-32"
                    style={{ accentColor: 'var(--color-brand)' }}
                    disabled={!speakEnabled}
                  />
                </div>
              </div>

              {/* Voice input settings */}
              <div className="pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-secondary)]">Auto-send voice input</div>
                    <div className="text-xs text-[var(--color-text-muted)]">Send immediately after transcription</div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={autoSendTranscription}
                    onClick={() => setAutoSendTranscription(!autoSendTranscription)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    style={{ backgroundColor: autoSendTranscription ? 'var(--color-brand)' : 'var(--color-surface-hover)' }}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoSendTranscription ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Debug section */}
              {debugMode && (
                <div className="pt-3 border-t border-[var(--color-border)]">
                  <button
                    onClick={handleDownloadLogs}
                    disabled={!threadId || currentLogCount === 0}
                    className="w-full rounded-lg border border-dashed border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] disabled:opacity-50 hover:bg-[var(--color-surface-hover)]/50 transition-colors"
                  >
                    Download logs ({currentLogCount} entries)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Input form */}
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={threadId ? "Send a message..." : "Select a conversation to start"}
              className="w-full rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-4 py-3 pr-24 text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/50 focus:border-transparent resize-none"
              disabled={!threadId}
              style={{ minHeight: "48px", maxHeight: "200px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 200) + "px";
              }}
            />

            {/* Action buttons */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* Voice input */}
              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                onTouchCancel={stopRecording}
                disabled={!threadId}
                className={`p-2 rounded-lg transition-colors ${
                  isRecording 
                    ? "bg-red-500 text-white animate-pulse" 
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isRecording ? "Recording..." : "Hold to talk"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>

              {/* Send button */}
              <button
                type="submit"
                disabled={!threadId || !inputValue.trim() || isLoading}
                className="p-2 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-brand)' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
              >
                {isLoading ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" className="animate-spin">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </form>

          <p className="mt-2 text-xs text-center text-[var(--color-text-muted)]">
            Press Enter to send, Shift+Enter for new line
          </p>
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
      setIsPlaying(false);
      lastSpokenRef.current = "";
    } catch {}
  }, []);

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
    
    if (messages.length === 0) {
      animatedMessagesRef.current.clear();
    }
  }, [messages, isLoading, isAtBottom]);

  useEffect(() => {
    if (!enableAudio) return;
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

  useEffect(() => {
    if (!enableAudio) {
      setPlayBlocked(false);
      setIsPlaying(false);
      stopTTS();
    }
  }, [enableAudio, stopTTS]);

  useEffect(() => {
    return () => {
      stopTTS();
    };
  }, [stopTTS]);

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: 'color-mix(in srgb, var(--color-brand) 20%, transparent)' }}>
          <svg className="w-8 h-8" style={{ color: 'var(--color-brand)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-semibold text-[var(--color-text)] mb-2">Start a conversation</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md">Ask me anything — math, science, coding, writing, or any topic you want to explore.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Play blocked banner */}
      {playBlocked && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => {
              if (!audioRef.current) return;
              audioRef.current
                .play()
                .then(() => setPlayBlocked(false))
                .catch(() => {});
            }}
            className="px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-lg transition-colors"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Play response
          </button>
        </div>
      )}

      {/* Stop button */}
      {isPlaying && enableAudio && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={stopTTS}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            Stop
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setIsAtBottom(distanceFromBottom < 48);
        }}
      >
        <div className="px-4 md:px-8 lg:px-12 py-6 space-y-6">
          {messages.map((m) => {
            const isNewMessage = !animatedMessagesRef.current.has(m.id);
            if (isNewMessage) {
              animatedMessagesRef.current.add(m.id);
            }
            
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                style={isNewMessage ? { animation: "fade-in-message 0.3s ease-out" } : undefined}
              >
                {/* Avatar for assistant */}
                {m.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`max-w-[90%] md:max-w-[85%] lg:max-w-[80%] rounded-2xl px-4 py-3 ${
                    m.role === "user"
                      ? "text-white"
                      : "bg-[var(--color-surface-elevated)]/80 text-[var(--color-text)] border border-[var(--color-border)]/50"
                  }`}
                  style={m.role === "user" ? { backgroundColor: 'var(--color-brand)' } : undefined}
                >
                  {m.role === "assistant" && m.speechContent && !enableAudio ? (
                    <>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          urlTransform={(value) => value}
                          components={markdownComponents(m.role)}
                        >
                          {convertMathDelimiters(m.speechContent)}
                        </ReactMarkdown>
                      </div>
                      {m.content && m.content !== m.speechContent && (
                        <>
                          <hr className="my-3 border-[var(--color-border)]" />
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              urlTransform={(value) => value}
                              components={markdownComponents(m.role)}
                            >
                              {convertMathDelimiters(m.content)}
                            </ReactMarkdown>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        urlTransform={(value) => value}
                        components={markdownComponents(m.role)}
                      >
                        {convertMathDelimiters(m.content)}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Play button for assistant messages */}
                {m.role === "assistant" && m.content && enableAudio && (
                  <PlayTTS
                    text={m.speechContent || m.content}
                    className="flex-shrink-0 p-2 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors self-start"
                    playbackRate={playbackRate}
                  />
                )}

                {/* Avatar for user */}
                {m.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="bg-[var(--color-surface-elevated)]/80 border border-[var(--color-border)]/50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// Markdown components for rendering
function markdownComponents(role: "user" | "assistant") {
  const isUser = role === "user";
  return {
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc ml-5 my-2 space-y-1" {...props} />,
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />,
    li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed" {...props} />,
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        className={isUser ? "text-white underline" : "underline"}
        style={!isUser ? { color: 'var(--color-brand)' } : undefined}
        rel="noopener noreferrer"
        target="_blank"
        {...props}
      />
    ),
    // eslint-disable-next-line @next/next/no-img-element
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt || "Generated image"}
        className="max-w-full h-auto rounded-lg my-2 border border-[var(--color-border)]"
        loading="lazy"
        {...props}
      />
    ),
    strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold" {...props} />,
    em: (props: React.HTMLAttributes<HTMLElement>) => <em className="italic" {...props} />,
    code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <code
        className={`${isUser ? "bg-white/20" : "bg-[var(--color-surface)]"} rounded px-1.5 py-0.5 font-mono text-[0.9em]`}
        {...props}
      >
        {children}
      </code>
    ),
    pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
      <pre className={`${isUser ? "bg-white/15" : "bg-[var(--color-surface)]"} overflow-x-auto rounded-lg p-3 my-2`} {...props} />
    ),
    blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote className={`${isUser ? "border-white/40" : "border-[var(--color-border)]"} border-l-2 pl-3 my-2 italic`} {...props} />
    ),
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => <hr className="border-[var(--color-border)] my-3" {...props} />,
    table: (props: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="overflow-x-auto my-2">
        <table className="table-auto border-collapse text-sm" {...props} />
      </div>
    ),
    th: (props: React.HTMLAttributes<HTMLTableCellElement>) => <th className="border border-[var(--color-border)] px-2 py-1" {...props} />,
    td: (props: React.HTMLAttributes<HTMLTableCellElement>) => <td className="border border-[var(--color-border)] px-2 py-1 align-top" {...props} />,
  };
}
