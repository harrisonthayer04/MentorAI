"use client";

import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle";

type ChatThread = {
  id: string;
  title: string;
  createdAt: number;
};

export default function DashboardClient() {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState<ChatThread[]>([]);

  // Load chats from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bm_chats");
      if (raw) setChats(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Persist chats
  useEffect(() => {
    try {
      localStorage.setItem("bm_chats", JSON.stringify(chats));
    } catch {
      // ignore
    }
  }, [chats]);

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.createdAt - a.createdAt),
    [chats]
  );

  const handleNewChat = () => {
    const now = Date.now();
    const newChat: ChatThread = {
      id: String(now),
      title: `New chat ${new Date(now).toLocaleTimeString()}`,
      createdAt: now,
    };
    setChats((prev) => [newChat, ...prev]);
  };

  const handleDeleteChat = (id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="relative">
      {/* Toggle Button (Top-left) */}
      <button
        aria-label="Open menu"
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-50 h-11 w-11 rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/10 shadow hover:shadow-lg transition-all text-gray-800 dark:text-gray-100 flex items-center justify-center"
      >
        <span className="sr-only">Open menu</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

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
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
        </div>

        <div className="p-4 border-b border-white/40 dark:border-white/10">
          <button
            onClick={handleNewChat}
            className="w-full rounded-xl bg-[var(--color-brand)] hover:bg-[color-mix(in_oklab,var(--color-brand),black_10%)] text-white font-display font-semibold px-4 py-3 transition-colors"
          >
            New chat
          </button>
        </div>

        <div className="p-2 overflow-y-auto h-[calc(100vh-140px)]">
          {sortedChats.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-gray-600 dark:text-gray-300">
              No chats yet
            </div>
          ) : (
            <ul className="space-y-1">
              {sortedChats.map((chat) => (
                <li key={chat.id}>
                  <div className="group w-full px-3 py-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 text-gray-900 dark:text-gray-100 flex items-center justify-between">
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
      </aside>

      {/* Content is rendered by ChatWorkspace in the page component */}
    </div>
  );
}


