"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export default function ChatWorkspace({ threadId }: { threadId: string | null }) {
  const [modelId, setModelId] = useState<string>("gpt-5-chat");
  const [inputValue, setInputValue] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const messageCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());

  // Keep messages as-is; if we ever need chronological order, sort at render time.

  // Latest assistant text is computed inside ChatPanel for TTS playback

  const sendMessage = async () => {
    if (isLoading) return;
    const text = inputValue.trim();
    if (!text) return;
    if (!threadId) return; // can't send without a selected thread
    const now = Date.now();
    const userMsg: ChatMessage = { id: `u_${now}`, role: "user", content: text, createdAt: now };
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
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: threadId, role: "user", content: text }),
          keepalive: true,
        });
      } catch {}

      // Trigger AI response; server will persist assistant reply
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          messages: [
            { role: "system", content: "You are a helpful teaching assistant." },
            ...messages.map(({ role, content }) => ({ role, content })),
            { role: "user", content: text },
          ],
          conversationId: threadId,
        }),
        keepalive: true,
      });
      const data = await resp.json();
      const content = data?.content ?? data?.error ?? "(no response)";
      // Do not append assistant locally (server will save it). Rely on polling below to render.
      if (data?.error) {
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
        const data = (await res.json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }> };
        if (cancelled) return;
        const normalized = (data.messages || []).map((m) => ({ ...m, createdAt: new Date(m.createdAt).getTime() } as ChatMessage));
        setMessages(normalized);
        messageCacheRef.current.set(threadId, normalized);
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
      const raw = localStorage.getItem("bm_speak_enabled");
      if (raw != null) setSpeakEnabled(raw === "true");
    } catch {
      // ignore
    }
  }, []);

  // Persist speak setting
  useEffect(() => {
    try {
      localStorage.setItem("bm_speak_enabled", String(speakEnabled));
    } catch {
      // ignore
    }
  }, [speakEnabled]);

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
                <option value="gpt-5-chat">GPT-5</option>
                <option value="gpt-5-mini">GPT-5 mini</option>
                <option value="gpt-5-nano">GPT-5 nano</option>
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
            </div>

            {/* Chat input */}
            <form onSubmit={handleSubmit} className="p-4 mt-auto">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your message</label>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                placeholder={threadId ? "Type here..." : "Create or select a conversation to start"}
                className="w-full rounded-xl bg-white/80 dark:bg-gray-900/40 border border-white/40 dark:border-white/10 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/40 resize-none"
                disabled={!threadId}
              />
              <div className="mt-3 flex justify-end">
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
          <ChatPanel messages={messages} isLoading={isLoading} enableAudio={speakEnabled} />
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ messages, isLoading, enableAudio }: { messages: ChatMessage[]; isLoading: boolean; enableAudio: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastSpokenRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const [playBlocked, setPlayBlocked] = useState<boolean>(false);
  const [showTopBlur, setShowTopBlur] = useState<boolean>(false);

  const convertMathDelimiters = useCallback((input: string) => {
    return input
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => `$$${content}$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => `$${content}$`);
  }, []);

  const latestAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }, [messages]);

  const speakWithWebSpeech = useCallback((text: string) => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }, []);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    } else {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    const el2 = containerRef.current;
    if (el2) setShowTopBlur(el2.scrollTop > 0);
  }, [messages, isLoading]);

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
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) {
          speakWithWebSpeech(text);
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
        };
        try {
          setPlayBlocked(false);
          await audio.play();
        } catch {
          setPlayBlocked(true);
        }
        lastSpokenRef.current = text;
      } catch {
        speakWithWebSpeech(text);
        lastSpokenRef.current = text;
      }
    };
    tryPlayTts();
    return () => {
      revoked = true;
    };
  }, [latestAssistantText, speakWithWebSpeech, enableAudio]);

  // Reset playBlocked if audio is disabled
  useEffect(() => {
    if (!enableAudio) setPlayBlocked(false);
  }, [enableAudio]);

  useEffect(() => {
    return () => {
      try { audioRef.current?.pause(); } catch {}
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
    };
  }, []);

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow overflow-hidden relative">
      {showTopBlur && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 md:h-6 bg-gradient-to-b from-black/10 to-transparent dark:from-black/20 z-10" />
      )}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[var(--color-brand)] animate-pulse" />
            <span className="h-3 w-3 rounded-full bg-[var(--color-brand)] [animation:pulse_1.2s_0.2s_infinite]" />
            <span className="h-3 w-3 rounded-full bg-[var(--color-brand)] [animation:pulse_1.2s_0.4s_infinite]" />
          </div>
        </div>
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
      <div
        ref={containerRef}
        className="w-full flex-1 overflow-y-auto p-3 md:p-4 pb-8 space-y-3"
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          setShowTopBlur(el.scrollTop > 0);
        }}
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
                  p: (props) => (
                    <p className="mb-2 leading-relaxed" {...props} />
                  ),
                  ul: (props) => (
                    <ul className="list-disc ml-5 my-2 space-y-1" {...props} />
                  ),
                  ol: (props) => (
                    <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />
                  ),
                  li: (props) => <li className="leading-relaxed" {...props} />,
                  a: (props) => (
                    <a
                      className={`${m.role === "user" ? "text-white underline" : "text-blue-700 dark:text-blue-400 underline"} break-words`}
                      rel="noopener noreferrer"
                      target="_blank"
                      {...props}
                    />
                  ),
                  strong: (props) => (
                    <strong className="font-semibold" {...props} />
                  ),
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
                    <pre
                      className={`${m.role === "user" ? "bg-white/15" : "bg-black/5 dark:bg-white/5"} overflow-x-auto rounded-lg p-3 my-2`}
                      {...props}
                    />
                  ),
                  blockquote: (props) => (
                    <blockquote
                      className={`${m.role === "user" ? "border-white/40" : "border-black/20 dark:border-white/20"} border-l-2 pl-3 my-2 italic`}
                      {...props}
                    />
                  ),
                  hr: (props) => (
                    <hr className={`${m.role === "user" ? "border-white/20" : "border-black/10 dark:border-white/10"} my-3`} {...props} />
                  ),
                  table: (props) => (
                    <div className="overflow-x-auto my-2">
                      <table className="table-auto border-collapse text-sm" {...props} />
                    </div>
                  ),
                  th: (props) => (
                    <th className="border px-2 py-1" {...props} />
                  ),
                  td: (props) => (
                    <td className="border px-2 py-1 align-top" {...props} />
                  ),
                }}
              >
                {convertMathDelimiters(m.content)}
              </ReactMarkdown>
            </div>
          </div>
        ))}
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


