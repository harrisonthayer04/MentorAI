"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";
import ChatWorkspace from "./ChatWorkspace";
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
      // Do not sign out on component unmount to avoid accidental logout in Strict Mode
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
          // If unauthorized, send the user to sign-in
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

  // Auto-select the most recent chat if none is selected
  useEffect(() => {
    if (selectedChatId || chats.length === 0) return;
    const latest = chats.reduce<ChatThread | null>((acc, c) => {
      if (!acc) return c;
      return c.createdAt > acc.createdAt ? c : acc;
    }, null);
    if (latest) setSelectedChatId(latest.id);
  }, [chats, selectedChatId]);

  return (
    <div className="relative">
      {/* Top bar with integrated hamburger so it doesn't cover content */}
      <div className="sticky top-0 z-30 px-2 md:px-4 py-2 md:py-3">
        <div className="h-12 rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow flex items-center gap-2 px-2 md:px-3">
          <button
            aria-label="Open menu"
            onClick={() => setIsOpen(true)}
            className="h-10 w-10 rounded-xl bg-white/70 dark:bg-white/5 border border-white/30 dark:border-white/10 flex items-center justify-center text-gray-800 dark:text-gray-100"
          >
            <span className="sr-only">Open menu</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="text-sm font-display font-semibold text-gray-900 dark:text-white">Dashboard</div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        />
      )}

      {/* Slide-in Pane */}
      <aside
        className={`fixed z-50 top-0 left-0 h-full w-72 bg-white/80 dark:bg-white/10 backdrop-blur-xl border-r border-white/40 dark:border-white/10 shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-white/40 dark:border-white/10">
          <div className="text-sm font-display font-semibold text-gray-900 dark:text-white">Conversations</div>
          <button
            aria-label="Close menu"
            onClick={() => setIsOpen(false)}
            className="h-9 w-9 rounded-xl bg-white/70 dark:bg-white/5 border border-white/30 dark:border-white/10 flex items-center justify-center text-gray-800 dark:text-gray-200"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex h-[calc(100%-64px)] flex-col">
          <div className="p-4 border-b border-white/40 dark:border-white/10">
            <button
              onClick={handleNewChat}
              className="w-full rounded-xl bg-[var(--color-brand)] hover:bg-[color-mix(in_oklab,var(--color-brand),black_10%)] text-white font-display font-semibold px-4 py-3 transition-colors"
            >
              New chat
            </button>
          </div>

          <div className="p-2 overflow-y-auto flex-1">
            {sortedChats.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-gray-600 dark:text-gray-300">
                No chats yet
              </div>
            ) : (
              <ul className="space-y-1">
                {sortedChats.map((chat) => (
                  <li key={chat.id}>
                    <div
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
                      className={`group w-full px-3 py-2 rounded-lg text-left text-gray-900 dark:text-gray-100 flex items-center justify-between cursor-pointer ${
                        chat.id === selectedChatId
                          ? "bg-white/80 dark:bg-white/15 ring-1 ring-[var(--color-brand)]/30"
                          : "hover:bg-white/60 dark:hover:bg-white/10"
                      }`}
                      aria-current={chat.id === selectedChatId ? "true" : undefined}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{chat.title}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(chat.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        aria-label="Delete chat"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(chat.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-8 w-8 rounded-lg flex items-center justify-center text-gray-700 dark:text-gray-300 hover:text-red-500 hover:bg-white/70 dark:hover:bg-white/10 border border-transparent hover:border-white/40 dark:hover:border-white/10"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 border-t border-white/40 dark:border-white/10">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/settings");
                }}
                className="rounded-xl bg-white/70 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 border border-white/40 dark:border-white/10 px-4 py-2 text-gray-900 dark:text-gray-100"
              >
                Settings
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-xl bg-red-500/90 hover:bg-red-600 text-white px-4 py-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="h-[calc(100vh-64px)] md:h-[calc(100vh-72px)] px-2 md:px-4 pb-2 md:pb-3">
        <ChatWorkspace threadId={selectedChatId} />
      </div>
    </div>
  );
}


