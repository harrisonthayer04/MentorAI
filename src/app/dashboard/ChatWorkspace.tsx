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

export default function ChatWorkspace() {
  const [modelId, setModelId] = useState<string>("gpt-5-chat");
  const [inputValue, setInputValue] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Keep messages as-is; if we ever need chronological order, sort at render time.

  // Latest assistant text is computed inside ChatPanel for TTS playback

  const sendMessage = async () => {
    if (isLoading) return;
    const text = inputValue.trim();
    if (!text) return;
    const now = Date.now();
    const userMsg: ChatMessage = { id: `u_${now}`, role: "user", content: text, createdAt: now };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    try {
      setIsLoading(true);
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
        }),
      });
      const data = await resp.json();
      const content = data?.content ?? data?.error ?? "(no response)";
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: `Error: ${message}`,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="w-full px-2 md:px-4 py-2 md:py-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-stretch h-[calc(100vh-1rem)] md:h-[calc(100vh-1.5rem)] overflow-hidden">
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

            {/* Chat input */}
            <form onSubmit={handleSubmit} className="p-4 mt-auto">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your message</label>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                placeholder="Type here..."
                className="w-full rounded-xl bg-white/80 dark:bg-gray-900/40 border border-white/40 dark:border-white/10 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/40 resize-none"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--color-brand)] hover:bg-[color-mix(in_oklab,var(--color-brand),black_10%)] text-white font-display font-semibold px-4 py-2 transition-colors"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Conversation area (3/4) */}
        <div className="md:col-span-9 min-h-0 h-full">
          <ChatPanel messages={messages} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ messages, isLoading }: { messages: ChatMessage[]; isLoading: boolean }) {
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
  }, [latestAssistantText, speakWithWebSpeech]);

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
                  p: ({ node, ...props }) => (
                    <p className="mb-2 leading-relaxed" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc ml-5 my-2 space-y-1" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />
                  ),
                  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                  a: ({ node, ...props }) => (
                    <a
                      className={`${m.role === "user" ? "text-white underline" : "text-blue-700 dark:text-blue-400 underline"} break-words`}
                      rel="noopener noreferrer"
                      target="_blank"
                      {...props}
                    />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong className="font-semibold" {...props} />
                  ),
                  em: ({ node, ...props }) => <em className="italic" {...props} />,
                  code: ({ className, children, ...props }) => (
                    <code
                      className={`${m.role === "user" ? "bg-white/20 text-white" : "bg-black/10 dark:bg-white/10 text-inherit"} rounded px-1 py-0.5 font-mono text-[0.9em]`}
                      {...props}
                    >
                      {children}
                    </code>
                  ),
                  pre: ({ node, ...props }) => (
                    <pre
                      className={`${m.role === "user" ? "bg-white/15" : "bg-black/5 dark:bg-white/5"} overflow-x-auto rounded-lg p-3 my-2`}
                      {...props}
                    />
                  ),
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      className={`${m.role === "user" ? "border-white/40" : "border-black/20 dark:border-white/20"} border-l-2 pl-3 my-2 italic`}
                      {...props}
                    />
                  ),
                  hr: ({ node, ...props }) => (
                    <hr className={`${m.role === "user" ? "border-white/20" : "border-black/10 dark:border-white/10"} my-3`} {...props} />
                  ),
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="table-auto border-collapse text-sm" {...props} />
                    </div>
                  ),
                  th: ({ node, ...props }) => (
                    <th className="border px-2 py-1" {...props} />
                  ),
                  td: ({ node, ...props }) => (
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


