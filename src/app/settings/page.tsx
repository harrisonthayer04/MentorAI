"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Memory = { id: string; title: string | null; content: string; createdAt: string; updatedAt: string };

export default function SettingsPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newContent, setNewContent] = useState<string>("");
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/memories", { cache: "no-store" });
      if (!r.ok) {
        const text = await r.text();
        let errorMsg = "Failed to load memories";
        try {
          const j = JSON.parse(text) as { error?: string };
          errorMsg = j?.error || errorMsg;
        } catch {
          errorMsg = `HTTP ${r.status}: ${text || r.statusText}`;
        }
        throw new Error(errorMsg);
      }
      const text = await r.text();
      if (!text.trim()) {
        setMemories([]);
        return;
      }
      const j = JSON.parse(text) as { memories?: Memory[] };
      setMemories(j.memories || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load memories";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const createMemory = async () => {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!content) return;
    try {
      const r = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (r.ok) {
        setNewTitle("");
        setNewContent("");
        refresh();
      } else {
        const text = await r.text();
        let errorMsg = "Failed to create memory";
        try {
          const j = JSON.parse(text) as { error?: string };
          errorMsg = j?.error || errorMsg;
        } catch {
          errorMsg = `HTTP ${r.status}: ${text || r.statusText}`;
        }
        setError(errorMsg);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create memory";
      setError(message);
    }
  };

  const updateMemory = async (id: string, payload: Partial<Pick<Memory, "title" | "content">>) => {
    try {
      const r = await fetch(`/api/memories/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        refresh();
      } else {
        const text = await r.text();
        let errorMsg = "Failed to update memory";
        try {
          const j = JSON.parse(text) as { error?: string };
          errorMsg = j?.error || errorMsg;
        } catch {
          errorMsg = `HTTP ${r.status}: ${text || r.statusText}`;
        }
        setError(errorMsg);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update memory";
      setError(message);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      const r = await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) {
        refresh();
      } else {
        const text = await r.text();
        let errorMsg = "Failed to delete memory";
        try {
          const j = JSON.parse(text) as { error?: string };
          errorMsg = j?.error || errorMsg;
        } catch {
          errorMsg = `HTTP ${r.status}: ${text || r.statusText}`;
        }
        setError(errorMsg);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete memory";
      setError(message);
    }
  };

  const deleteAccount = async () => {
    if (!confirm("Are you sure you want to permanently delete your account? This cannot be undone.")) return;
    setIsDeletingAccount(true);
    try {
      const r = await fetch("/api/user", { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json())?.error || "Failed to delete account");
      await signOut({ callbackUrl: "/" });
    } catch (e) {
      setIsDeletingAccount(false);
      const message = e instanceof Error ? e.message : "Failed to delete account";
      alert(message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-start)] via-[var(--color-bg-mid)] to-[var(--color-bg-end)]">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow p-6">
          <h1 className="text-xl font-display font-semibold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Manage your account and memories.</p>
        </div>

        <div className="rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-semibold text-gray-900 dark:text-white">Account</h2>
            <button
              onClick={deleteAccount}
              disabled={isDeletingAccount}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-60"
            >
              {isDeletingAccount ? "Deleting…" : "Delete account"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">This permanently deletes your account and all data.</p>
        </div>

        <div className="rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow p-6">
          <h2 className="text-lg font-display font-semibold text-gray-900 dark:text-white">Memories</h2>

          <div className="mt-4 grid gap-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Optional title"
              className="w-full rounded-md bg-white/80 dark:bg-white/10 border border-white/40 dark:border-white/10 px-3 py-2 text-sm"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write a new memory..."
              rows={3}
              className="w-full rounded-md bg-white/80 dark:bg-white/10 border border-white/40 dark:border-white/10 px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <button onClick={createMemory} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm">
                Save memory
              </button>
            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">Loading…</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : memories.length === 0 ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">No memories yet.</p>
            ) : (
              <ul className="space-y-3">
                {memories.map((m) => (
                  <li key={m.id} className="rounded-lg border border-white/40 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                    <div className="flex items-start gap-2">
                      <input
                        defaultValue={m.title || ""}
                        placeholder="Title"
                        onBlur={(e) => updateMemory(m.id, { title: e.target.value })}
                        className="flex-1 rounded-md bg-white/80 dark:bg.white/10 border border-white/40 dark:border-white/10 px-2 py-1 text-sm"
                      />
                      <button onClick={() => deleteMemory(m.id)} className="text-xs text-red-600">Delete</button>
                    </div>
                    <textarea
                      defaultValue={m.content}
                      onBlur={(e) => updateMemory(m.id, { content: e.target.value })}
                      rows={3}
                      className="mt-2 w-full rounded-md bg-white/80 dark:bg-white/10 border border-white/40 dark:border-white/10 px-2 py-1 text-sm"
                    />
                    <p className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">
                      Updated {new Date(m.updatedAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


