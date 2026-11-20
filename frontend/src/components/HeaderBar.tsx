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
    <header className="flex h-[54px] shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-base px-3 sm:gap-3 sm:px-[18px]">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-border-subtle bg-transparent text-text-secondary transition-colors duration-150 hover:bg-bg-surface hover:text-text-primary"
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

        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-[0.88rem] font-semibold tracking-[-0.01em] text-text-primary sm:text-[0.94rem]">
            Asisten Akademik TI
          </span>
          <span className="hidden items-center gap-1.5 text-[0.78rem] whitespace-nowrap text-text-muted sm:inline-flex">
            <span
              className="h-1.5 w-1.5 rounded-full bg-status-ok"
              aria-hidden="true"
            />
            {faqCount} referensi aktif
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border bg-transparent px-2.5 py-[5px] text-[0.76rem] font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 sm:px-[11px] sm:text-[0.8rem] ${
            hasCustomKey
              ? "border-status-ok text-text-primary hover:bg-bg-surface"
              : "border-dashed border-border-subtle text-text-muted hover:border-border-focus hover:bg-bg-surface hover:text-text-secondary"
          }`}
          onClick={onOpenApiKeyModal}
          disabled={isSending}
          title={
            hasCustomKey
              ? `Kunci aktif: ${activeProviderLabel} (${maskApiKey(apiKeyConfig!.apiKey)})`
              : "Belum ada kunci API tersimpan. Klik untuk menambahkan kunci API."
          }
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              hasCustomKey
                ? "bg-status-ok shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                : "bg-text-muted"
            }`}
            aria-hidden="true"
          />
          {hasCustomKey ? (
            <>
              <span className="sm:hidden">{activeProviderLabel}</span>
              <span className="hidden sm:inline">
                {activeProviderLabel} ({maskApiKey(apiKeyConfig!.apiKey)})
              </span>
            </>
          ) : (
            <>
              <span className="sm:hidden">Kunci API</span>
              <span className="hidden sm:inline">Tambah Kunci API</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="cursor-pointer rounded-[6px] border border-border-subtle bg-transparent px-2.5 py-[5px] text-[0.76rem] font-medium whitespace-nowrap text-text-secondary transition-colors duration-150 hover:enabled:bg-bg-surface hover:enabled:text-text-primary disabled:cursor-not-allowed disabled:opacity-45 sm:px-[11px] sm:text-[0.8rem]"
          onClick={onClearSession}
          disabled={!hasMessages && !isSending}
          title={
            isSending
              ? "Batalkan pengiriman dan reset sesi"
              : "Bersihkan riwayat percakapan"
          }
        >
          {isSending ? "Batalkan" : "Bersihkan"}
        </button>
      </div>
    </header>
  );
}
