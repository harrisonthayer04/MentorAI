"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Memory = { id: string; title: string | null; content: string; createdAt: string; updatedAt: string };

const DEFAULT_ACCENT_COLOR = "#6366f1";

const PRESET_COLORS = [
  { name: "Indigo", color: "#6366f1" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Emerald", color: "#10b981" },
  { name: "Amber", color: "#f59e0b" },
  { name: "Rose", color: "#f43f5e" },
  { name: "Purple", color: "#a855f7" },
  { name: "Slate", color: "#64748b" },
];

function applyAccentColor(color: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--color-brand", color);
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
  const [debugModeEnabled, setDebugModeEnabled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"general" | "memories" | "account">("general");

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
      try {
        const saved = localStorage.getItem("accent_color");
        if (saved) {
          setAccentColor(saved);
        }
      } catch {}
      try {
        const storedDebug = localStorage.getItem("bm_debug_mode");
        setDebugModeEnabled(storedDebug === "true");
      } catch {}
    }
  }, [isOpen]);

  const handleColorChange = (color: string) => {
    setAccentColor(color);
    applyAccentColor(color);
    try {
      localStorage.setItem("accent_color", color);
    } catch {}
  };

  const handleDebugToggle = (enabled: boolean) => {
    setDebugModeEnabled(enabled);
    try {
      localStorage.setItem("bm_debug_mode", String(enabled));
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("bm_debug_mode_changed", {
          detail: { enabled },
        })
      );
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
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        style={{ animation: "fade-in 0.15s ease-out" }}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-zinc-900 border-l border-zinc-800 shadow-2xl overflow-y-auto"
        style={{ animation: "fade-in 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-display font-semibold text-zinc-100">Settings</h1>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Close settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-zinc-800">
          <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
            {[
              { id: "general" as const, label: "General" },
              { id: "memories" as const, label: "Memories" },
              { id: "account" as const, label: "Account" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Theme Section */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">Accent Color</h2>
                  <p className="text-xs text-zinc-500 mt-1">Choose your preferred accent color</p>
                </div>
                
                {/* Preset Colors */}
                <div className="grid grid-cols-8 gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => handleColorChange(preset.color)}
                      className="aspect-square rounded-lg transition-all hover:scale-110 relative"
                      style={{
                        backgroundColor: preset.color,
                        boxShadow: accentColor === preset.color ? `0 0 0 2px #27272a, 0 0 0 4px ${preset.color}` : "none",
                      }}
                      title={preset.name}
                    >
                      {accentColor === preset.color && (
                        <svg className="absolute inset-0 w-full h-full p-1.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>

                {/* Custom Color */}
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-10 w-16 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
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
                    placeholder="#6366f1"
                    className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono uppercase text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <button
                    onClick={() => handleColorChange(DEFAULT_ACCENT_COLOR)}
                    className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Debug Section */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">Developer</h2>
                  <p className="text-xs text-zinc-500 mt-1">Advanced options for debugging</p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50 border border-zinc-800">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">Debug logging</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Enable verbose logging for chat transcripts</div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={debugModeEnabled}
                    onClick={() => handleDebugToggle(!debugModeEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      debugModeEnabled ? "bg-indigo-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        debugModeEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "memories" && (
            <div className="space-y-6">
              {/* Create Memory */}
              <div className="space-y-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Memory title (optional)"
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write something you want me to remember about you..."
                  rows={3}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
                <button
                  onClick={createMemory}
                  disabled={!newContent.trim()}
                  className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Memory
                </button>
              </div>

              {/* Memory List */}
              <div className="pt-6 border-t border-zinc-800">
                {loading ? (
                  <p className="text-sm text-zinc-500 text-center py-8">Loading...</p>
                ) : error ? (
                  <p className="text-sm text-red-400 text-center py-8">{error}</p>
                ) : memories.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 mx-auto mb-3 flex items-center justify-center">
                      <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <p className="text-sm text-zinc-500">No memories yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Add memories to help personalize your experience</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {memories.map((m) => (
                      <div key={m.id} className="rounded-xl bg-zinc-800/50 border border-zinc-800 p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <input
                            defaultValue={m.title || ""}
                            placeholder="Title"
                            onBlur={(e) => updateMemory(m.id, { title: e.target.value })}
                            className="flex-1 bg-transparent border-none text-sm font-medium text-zinc-200 focus:outline-none placeholder-zinc-500"
                          />
                          <button
                            onClick={() => deleteMemory(m.id)}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                            </svg>
                          </button>
                        </div>
                        <textarea
                          defaultValue={m.content}
                          onBlur={(e) => updateMemory(m.id, { content: e.target.value })}
                          rows={2}
                          className="w-full bg-transparent border-none text-sm text-zinc-400 focus:outline-none resize-none"
                        />
                        <p className="text-xs text-zinc-600 mt-2">
                          Updated {new Date(m.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="space-y-6">
              {/* Danger Zone */}
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-2">Danger Zone</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                  onClick={deleteAccount}
                  disabled={isDeletingAccount}
                  className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {isDeletingAccount ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
