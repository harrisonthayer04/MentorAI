"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Memory = { id: string; title: string | null; content: string; createdAt: string; updatedAt: string };

const DEFAULT_ACCENT_COLOR = "#9B5DE5";

const PRESET_COLORS = [
  { name: "Purple", color: "#9B5DE5" },
  { name: "Blue", color: "#3B82F6" },
  { name: "Green", color: "#10B981" },
  { name: "Pink", color: "#EC4899" },
  { name: "Orange", color: "#F59E0B" },
  { name: "Red", color: "#EF4444" },
  { name: "Teal", color: "#14B8A6" },
  { name: "Indigo", color: "#6366F1" },
];

function applyAccentColor(color: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--color-brand", color);
  document.documentElement.style.setProperty("--color-accent-1", color);
  document.documentElement.style.setProperty("--color-accent-2", color);
  document.documentElement.style.setProperty("--color-ring", color);
}

export default function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newContent, setNewContent] = useState<string>("");
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT_COLOR);

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
    if (isOpen) {
      refresh();
      // Load saved accent color
      try {
        const saved = localStorage.getItem("accent_color");
        if (saved) {
          setAccentColor(saved);
        }
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  const handleColorChange = (color: string) => {
    setAccentColor(color);
    applyAccentColor(color);
    try {
      localStorage.setItem("accent_color", color);
    } catch {
      // ignore
    }
  };

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

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-gradient-to-br from-[var(--color-bg-start)] via-[var(--color-bg-mid)] to-[var(--color-bg-end)] shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/70 dark:bg-white/10 backdrop-blur border-b border-white/40 dark:border-white/10 px-4 md:px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-display font-semibold text-gray-900 dark:text-white">Settings</h1>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl bg-white/70 dark:bg-white/5 border border-white/30 dark:border-white/10 flex items-center justify-center text-gray-800 dark:text-gray-200 hover:bg-white/90 dark:hover:bg-white/10 transition-colors"
            aria-label="Close settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 py-6 space-y-6">
          {/* Account Section */}
          <div className="rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-gray-900 dark:text-white">Account</h2>
              <button
                onClick={deleteAccount}
                disabled={isDeletingAccount}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-60 hover:bg-red-700 transition-colors"
              >
                {isDeletingAccount ? "Deleting…" : "Delete account"}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">This permanently deletes your account and all data.</p>
          </div>

          {/* Theme Section */}
          <div className="rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur border border-white/40 dark:border-white/10 shadow p-6">
            <h2 className="text-lg font-display font-semibold text-gray-900 dark:text-white">Theme</h2>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Customize your accent color</p>
            
            <div className="mt-4 space-y-4">
              {/* Preset Colors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Quick Presets
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => handleColorChange(preset.color)}
                      className="group relative aspect-square rounded-xl border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: preset.color,
                        borderColor: accentColor === preset.color ? preset.color : "transparent",
                        boxShadow: accentColor === preset.color ? `0 0 0 2px white, 0 0 0 4px ${preset.color}` : "none",
                      }}
                      title={preset.name}
                    >
                      {accentColor === preset.color && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-xl">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Custom Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-12 w-24 rounded-xl border-2 border-white/40 dark:border-white/10 cursor-pointer"
                    title="Choose custom color"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAccentColor(val);
                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        handleColorChange(val);
                      }
                    }}
                    placeholder="#9B5DE5"
                    className="flex-1 rounded-xl bg-white/80 dark:bg-white/10 border border-white/40 dark:border-white/10 px-3 py-2 text-sm font-mono uppercase"
                  />
                  <button
                    onClick={() => handleColorChange(DEFAULT_ACCENT_COLOR)}
                    className="px-3 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    title="Reset to default"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 rounded-xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-white/5">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Preview</p>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded-xl text-white font-semibold transition-colors"
                    style={{ backgroundColor: accentColor }}
                  >
                    Primary Button
                  </button>
                  <div
                    className="px-4 py-2 rounded-xl border-2 font-semibold transition-colors"
                    style={{ borderColor: accentColor, color: accentColor }}
                  >
                    Outlined Button
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Memories Section */}
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
                <button onClick={createMemory} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">
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
                        <button onClick={() => deleteMemory(m.id)} className="text-xs text-red-600 hover:text-red-700 transition-colors">Delete</button>
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
    </>
  );
}

