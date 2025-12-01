"use client";

import { useState, useCallback, useEffect } from "react";

// Model provider configuration
type ModelInfo = {
  id: string;
  name: string;
  description?: string;
  supportsVision?: boolean;
  supportsImages?: boolean;
  isFree?: boolean;
};

type Provider = {
  id: string;
  name: string;
  icon: React.ReactNode;
  models: ModelInfo[];
};

const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M17.604 3.332L12.13 20.668h2.858l1.269-4.02h5.406l1.27 4.02H24L18.595 3.332h-.991zm.46 2.384l2.123 8.932h-4.265l2.142-8.932zM7.544 3.332L0 20.668h2.858l1.269-4.02h5.406l1.27 4.02h1.067L4.004 3.332h-2.46zm.46 2.384l2.123 8.932H5.862l2.142-8.932z" />
      </svg>
    ),
    models: [
      { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", description: "Most capable, best for complex tasks", supportsVision: true },
      { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", description: "Balanced performance and speed", supportsVision: true },
      { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", description: "Fast and efficient", supportsVision: true },
    ],
  },
  {
    id: "google",
    name: "Google",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    models: [
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", description: "Fast and efficient", supportsVision: true },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", description: "Latest Gemini model", supportsVision: true },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    models: [
      { id: "x-ai/grok-4-fast", name: "Grok 4 Fast", description: "Fast and capable", supportsVision: true },
      { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1", description: "Optimized for coding" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
    models: [
      { id: "openai/gpt-5.1", name: "GPT-5.1", description: "Latest flagship model", supportsVision: true },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini", description: "Fast and efficient", supportsVision: true },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    models: [
      { id: "groq/gpt-oss-20b", name: "GPT-OSS 20B", description: "Super fast inference", supportsVision: true },
    ],
  },
  {
    id: "sambanova",
    name: "SambaNova",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    models: [
      { id: "sambanova/gpt-oss-120b", name: "GPT-OSS 120B", description: "Large open source model", supportsVision: true },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    models: [
      { id: "deepseek/deepseek-r1-0528", name: "DeepSeek R1", description: "Reasoning model" },
      { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", description: "Latest DeepSeek model" },
    ],
  },
  {
    id: "opensource",
    name: "Open Source",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
    ),
    models: [
      { id: "minimax/minimax-m2:free", name: "MiniMax M2", description: "Free tier available", isFree: true },
      { id: "moonshot/kimi-k2-thinking", name: "Kimi K2 Thinking", description: "Advanced reasoning" },
      { id: "qwen/qwen3-235b-a22b-2507", name: "Qwen3 235B", description: "Large parameter model" },
      { id: "prime-intellect/intellect-3", name: "Intellect 3", description: "Prime Intellect model" },
      { id: "z-ai/glm-4.6", name: "GLM 4.6", description: "Zhipu AI model" },
    ],
  },
];

// Image generation models
const IMAGE_PROVIDERS: Provider[] = [
  {
    id: "google-image",
    name: "Google",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    models: [
      { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", description: "Fast image generation", supportsImages: true },
      { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", description: "High quality images", supportsImages: true },
    ],
  },
  {
    id: "openai-image",
    name: "OpenAI",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
    models: [
      { id: "openai/gpt-5-image", name: "GPT-5 Image", description: "OpenAI image generation", supportsImages: true },
    ],
  },
  {
    id: "flux",
    name: "Black Forest Labs",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    models: [
      { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", description: "High quality diffusion model", supportsImages: true },
    ],
  },
];

// Helper to find model info by ID
function findModelById(modelId: string, providers: Provider[]): { provider: Provider; model: ModelInfo } | null {
  for (const provider of providers) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  return null;
}

type ModelSelectorProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  mode: "chat" | "image";
};

export default function ModelSelector({
  isOpen,
  onClose,
  selectedModelId,
  onSelectModel,
  mode,
}: ModelSelectorProps) {
  const providers = mode === "chat" ? PROVIDERS : IMAGE_PROVIDERS;
  const [activeProviderId, setActiveProviderId] = useState<string>(providers[0].id);

  // Find current model's provider on open
  useEffect(() => {
    if (isOpen) {
      const found = findModelById(selectedModelId, providers);
      if (found) {
        setActiveProviderId(found.provider.id);
      }
    }
  }, [isOpen, selectedModelId, providers]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      onSelectModel(modelId);
      onClose();
    },
    [onSelectModel, onClose]
  );

  if (!isOpen) return null;

  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ animation: "fade-in 0.15s ease-out" }}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        style={{ animation: "slide-up 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {mode === "chat" ? "Select Chat Model" : "Select Image Model"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Provider tabs (left sidebar) */}
          <div className="w-48 border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 overflow-y-auto py-2">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setActiveProviderId(provider.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  activeProviderId === provider.id
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]/50 hover:text-[var(--color-text)]"
                }`}
              >
                <span className={activeProviderId === provider.id ? "text-[var(--color-brand)]" : ""}>
                  {provider.icon}
                </span>
                <span className="text-sm font-medium">{provider.name}</span>
              </button>
            ))}
          </div>

          {/* Models list (right side) */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {activeProvider.models.map((model) => {
                const isSelected = selectedModelId === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all ${
                      isSelected
                        ? "bg-[var(--color-brand)]/10 border-2 border-[var(--color-brand)]"
                        : "bg-[var(--color-surface-elevated)] border-2 border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                    }`}
                  >
                    {/* Selection indicator */}
                    <div
                      className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        isSelected
                          ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                          : "border-[var(--color-border)]"
                      }`}
                    >
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Model info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isSelected ? "text-[var(--color-brand)]" : "text-[var(--color-text)]"}`}>
                          {model.name}
                        </span>
                        {model.supportsVision && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400">
                            Vision
                          </span>
                        )}
                        {model.isFree && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/20 text-green-400">
                            Free
                          </span>
                        )}
                      </div>
                      {model.description && (
                        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{model.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)]/30">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] font-mono text-[10px]">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}

// Button component to trigger the model selector
type ModelSelectorButtonProps = {
  modelId: string;
  onClick: () => void;
  mode: "chat" | "image";
  className?: string;
};

export function ModelSelectorButton({ modelId, onClick, mode, className = "" }: ModelSelectorButtonProps) {
  const providers = mode === "chat" ? PROVIDERS : IMAGE_PROVIDERS;
  const found = findModelById(modelId, providers);
  const modelName = found?.model.name || modelId;
  const providerIcon = found?.provider.icon;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors ${className}`}
    >
      {providerIcon && <span className="text-[var(--color-text-secondary)]">{providerIcon}</span>}
      <span className="text-sm font-medium text-[var(--color-text)] truncate max-w-[150px]">{modelName}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] flex-shrink-0">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

// Export the providers for use elsewhere
export { PROVIDERS, IMAGE_PROVIDERS, findModelById };
export type { ModelInfo, Provider };

