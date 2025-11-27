"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";
import ChatWorkspace from "./ChatWorkspace";
import SettingsPanel from "../components/SettingsPanel";
import { getCsrfToken, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

type ChatThread = {
  id: string;
  title: string;
  createdAt: number;
};

export default function DashboardClient() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Load conversations from server
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/conversations", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversations: Array<{ id: string; title: string; createdAt: string | number }>;
        };
        if (cancelled) return;
        const normalized = (data.conversations || []).map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt as unknown as string | number).getTime(),
        })) as ChatThread[];
        setChats(normalized);
        const rawSelected = localStorage.getItem("bm_selected_chat");
        if (rawSelected) setSelectedChatId(rawSelected);
      } catch {
        // ignore
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // When chats list updates, ensure selection remains valid
  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].id);
    }
    if (selectedChatId && !chats.find((c) => c.id === selectedChatId)) {
      setSelectedChatId(chats[0]?.id ?? null);
    }
  }, [chats, selectedChatId]);

  // Persist selected chat id
  useEffect(() => {
    try {
      if (selectedChatId) {
        localStorage.setItem("bm_selected_chat", selectedChatId);
      } else {
        localStorage.removeItem("bm_selected_chat");
      }
    } catch {
      // ignore
    }
  }, [selectedChatId]);

  // Preload CSRF token for sign-out beacons
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getCsrfToken();
        if (!cancelled) setCsrfToken(token ?? null);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto sign-out when leaving the page (close tab, reload, navigate away)
  useEffect(() => {
    const signoutBeacon = () => {
      try {
        if (!csrfToken) return;
        const params = new URLSearchParams();
        params.set("csrfToken", csrfToken);
        params.set("json", "true");
        const blob = new Blob([params.toString()], { type: "application/x-www-form-urlencoded" });
        const url = "/api/auth/signout?callbackUrl=" + encodeURIComponent("/signin");
        navigator.sendBeacon(url, blob);
      } catch {
        // ignore
      }
    };
    const onPageHide = () => signoutBeacon();
    const onBeforeUnload = () => signoutBeacon();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [csrfToken]);

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.createdAt - a.createdAt),
    [chats]
  );

  const handleNewChat = () => {
    (async () => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversation: { id: string; title: string; createdAt: string | number };
        };
        const normalized = {
          ...data.conversation,
          createdAt: new Date(data.conversation.createdAt as unknown as string | number).getTime(),
        } as ChatThread;
        setChats((prev) => [normalized, ...prev]);
        setSelectedChatId(normalized.id);
        setIsOpen(false);
      } catch {
        // ignore
      }
    })();
  };

  const handleDeleteChat = (id: string) => {
    (async () => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch {}
      setChats((prev) => prev.filter((c) => c.id !== id));
      setSelectedChatId((current) => (current === id ? null : current));
    })();
  };

  // Auto-create welcome chat for new users
  useEffect(() => {
    if (selectedChatId || chats.length > 0) return;
    
    const createWelcomeChat = async () => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Welcome! Let's chat" }),
        });
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversation: { id: string; title: string; createdAt: string | number };
        };
        const normalized = {
          ...data.conversation,
          createdAt: new Date(data.conversation.createdAt as unknown as string | number).getTime(),
        } as ChatThread;
        setChats([normalized]);
        setSelectedChatId(normalized.id);
      } catch {
        // ignore
      }
    };
    
    createWelcomeChat();
  }, [chats, selectedChatId, router]);

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="h-screen bg-[var(--color-surface)] dark:bg-zinc-950 text-[var(--color-text)] flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="flex-shrink-0 h-14 px-4 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]/80 dark:bg-zinc-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Menu Toggle */}
          <button
            aria-label="Toggle sidebar"
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]/60 transition-colors"
          >
            {isOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
          
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-brand)] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-sm font-display font-semibold hidden sm:inline">MentorAI</span>
          </div>
        </div>

        {/* Current Chat Title */}
        <div className="flex-1 text-center">
          <span className="text-sm text-[var(--color-text-secondary)] truncate max-w-xs inline-block">
            {selectedChat?.title || "Select a conversation"}
          </span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]/60 transition-colors"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`fixed left-0 z-40 w-72 bg-[var(--color-surface-elevated)]/95 dark:bg-zinc-900/95 border-r border-[var(--color-border-subtle)] flex flex-col transition-all duration-200 ease-out overflow-hidden ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ top: '56px', height: 'calc(100vh - 56px)' }}
        >
          {/* Sidebar Header */}
          <div className="flex-shrink-0 p-4 border-b border-[var(--color-border-subtle)]">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white font-display font-semibold text-sm transition-colors"
              style={{ backgroundColor: 'var(--color-brand)' }}
              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto p-2">
            {sortedChats.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                No conversations yet
              </div>
            ) : (
              <div className="space-y-1">
                {sortedChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => {
                      setSelectedChatId(chat.id);
                      setIsOpen(false);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedChatId(chat.id);
                        setIsOpen(false);
                      }
                    }}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      chat.id === selectedChatId
                        ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]/50"
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{chat.title}</div>
                      <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {new Date(chat.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      aria-label="Delete chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(chat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-[var(--color-surface-hover)]/50 transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="flex-shrink-0 p-3 border-t border-[var(--color-border-subtle)]">
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]/60 text-sm transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </aside>

        {/* Overlay when sidebar is open */}
        {isOpen && (
          <button
            aria-label="Close sidebar"
            onClick={() => setIsOpen(false)}
            className="fixed left-0 right-0 bottom-0 z-30 bg-black/50"
            style={{ top: '56px', animation: 'overlay-fade-in 0.2s ease-out' }}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <ChatWorkspace threadId={selectedChatId} />
        </main>
      </div>

      {/* Settings Panel */}
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
