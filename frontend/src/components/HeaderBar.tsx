import type { ApiKeyConfig } from "../types/chat";
import {
  detectClientProvider,
  getProviderLabel,
  maskApiKey,
} from "../utils/providerDetect";

interface HeaderBarProps {
  faqCount: number;
  sidebarOpen: boolean;
  hasMessages: boolean;
  isSending: boolean;
  apiKeyConfig: ApiKeyConfig | null;
  onToggleSidebar: () => void;
  onOpenApiKeyModal: () => void;
  onClearSession: () => void;
}

export function HeaderBar({
  faqCount,
  sidebarOpen,
  hasMessages,
  isSending,
  apiKeyConfig,
  onToggleSidebar,
  onOpenApiKeyModal,
  onClearSession,
}: HeaderBarProps) {
  const hasCustomKey = Boolean(apiKeyConfig?.apiKey);
  const activeProviderLabel = hasCustomKey
    ? getProviderLabel(
        detectClientProvider(apiKeyConfig!.apiKey, apiKeyConfig!.provider)
      )
    : null;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Tutup panel topik" : "Buka panel topik"}
          title={sidebarOpen ? "Tutup panel topik" : "Buka panel topik"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <line
              x1="5.5"
              y1="2.5"
              x2="5.5"
              y2="13.5"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
        </button>

        <div className="brand">
          <span className="brand-title">Asisten Akademik TI</span>
          <span className="brand-meta">
            <span className="status-dot" aria-hidden="true" />
            {faqCount} referensi aktif
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className={`ghost-btn api-key-btn ${
            hasCustomKey ? "api-key-btn-active" : "api-key-btn-unconfigured"
          }`}
          onClick={onOpenApiKeyModal}
          disabled={isSending}
          title={
            hasCustomKey
              ? `Key memori aktif: ${activeProviderLabel} (${maskApiKey(apiKeyConfig!.apiKey)})`
              : "API Key belum disetel. Klik untuk memasang API Key AI Anda."
          }
        >
          <span
            className={`key-dot ${hasCustomKey ? "key-dot-on" : "key-dot-off"}`}
            aria-hidden="true"
          />
          {hasCustomKey
            ? `${activeProviderLabel} (${maskApiKey(apiKeyConfig!.apiKey)})`
            : "API Key Belum Disetel"}
        </button>

        <button
          type="button"
          className="ghost-btn"
          onClick={onClearSession}
          disabled={!hasMessages || isSending}
        >
          Bersihkan
        </button>
      </div>
    </header>
  );
}
