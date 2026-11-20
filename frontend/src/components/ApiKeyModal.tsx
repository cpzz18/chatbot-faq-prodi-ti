import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiKeyConfig, LlmProvider } from "../types/chat";
import {
  PROVIDER_OPTIONS,
  detectClientProvider,
  getProviderLabel,
  maskApiKey,
} from "../utils/providerDetect";

interface ApiKeyModalProps {
  open: boolean;
  currentConfig: ApiKeyConfig | null;
  onSave: (config: ApiKeyConfig | null) => void;
  onClose: () => void;
}

export function ApiKeyModal({
  open,
  currentConfig,
  onSave,
  onClose,
}: ApiKeyModalProps) {
  const [provider, setProvider] = useState<LlmProvider>(
    currentConfig?.provider ?? "auto"
  );
  const [apiKey, setApiKey] = useState<string>(currentConfig?.apiKey ?? "");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState<boolean>(false);
  const [securityOpen, setSecurityOpen] = useState<boolean>(false);
  const [rendered, setRendered] = useState<boolean>(open);
  const [visible, setVisible] = useState<boolean>(open);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setRendered(false), 280);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setProvider(currentConfig?.provider ?? "auto");
    setApiKey(currentConfig?.apiKey ?? "");
    setShowKey(false);
    setErrorMsg(null);
    setProviderOpen(false);
    setSecurityOpen(false);
  }, [open, currentConfig]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (providerOpen) {
          setProviderOpen(false);
        } else {
          onClose();
        }
      }
    }
    function handleMouseDown(e: MouseEvent) {
      if (
        providerOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setProviderOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open, providerOpen, onClose]);

  if (!rendered) return null;

  const trimmedKey = apiKey.trim();
  const detectedProvider = detectClientProvider(trimmedKey, provider);
  const detectedLabel = getProviderLabel(detectedProvider);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmedKey) {
      onSave(null);
      onClose();
      return;
    }
    if (/\s/.test(trimmedKey)) {
      setErrorMsg("API Key tidak boleh mengandung spasi atau baris baru.");
      return;
    }
    onSave({ apiKey: trimmedKey, provider });
    onClose();
  }

  function handleClearKey() {
    setApiKey("");
    setProvider("auto");
    setErrorMsg(null);
    onSave(null);
    onClose();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0e]/72 p-4 backdrop-blur-[4px] transition-opacity duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity] ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`no-scrollbar flex max-h-[88dvh] w-full max-w-[380px] flex-col gap-3 overflow-y-auto rounded-[14px] border border-border-subtle bg-bg-sidebar p-3.5 shadow-[0_24px_48px_rgba(0,0,0,0.55)] transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity] sm:max-w-[460px] sm:gap-3.5 sm:rounded-[16px] sm:p-5 ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-[0.94] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <h2
              id="api-key-modal-title"
              className="mt-0 mb-0.5 text-[0.94rem] font-semibold text-text-primary sm:text-[1rem]"
            >
              Konfigurasi API Key AI (BYOK)
            </h2>
            <p className="m-0 text-[0.75rem] leading-[1.4] text-text-secondary sm:text-[0.8rem]">
              Gunakan API key pribadi (Gemini, OpenAI, Groq, Claude, OpenRouter,
              atau DeepSeek) untuk pengujian langsung.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-border-subtle bg-transparent text-xs text-text-secondary transition-colors duration-150 hover:bg-bg-surface hover:text-text-primary sm:h-8 sm:w-8 sm:text-sm"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1" ref={dropdownRef}>
            <label
              id="llm-provider-label"
              className="text-[0.74rem] font-semibold text-text-secondary sm:text-[0.78rem]"
            >
              Provider AI
            </label>
            <div className="relative w-full">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={providerOpen}
                aria-labelledby="llm-provider-label"
                onClick={() => setProviderOpen((prev) => !prev)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[6px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-left font-sans text-[0.82rem] text-text-primary transition-colors duration-150 outline-none hover:border-border-focus focus:border-border-focus sm:py-2 sm:text-[0.84rem]"
              >
                <span className="truncate">
                  {PROVIDER_OPTIONS.find((o) => o.value === provider)?.label}
                </span>
                <svg
                  className={`shrink-0 text-text-secondary transition-transform duration-200 ${
                    providerOpen ? "rotate-180 text-text-primary" : ""
                  }`}
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {providerOpen && (
                <ul
                  role="listbox"
                  aria-labelledby="llm-provider-label"
                  className="no-scrollbar absolute top-[calc(100%+4px)] right-0 left-0 z-20 m-0 max-h-52 list-none overflow-y-auto rounded-[8px] border border-border-subtle bg-bg-surface p-1 shadow-[0_14px_30px_rgba(0,0,0,0.65)]"
                >
                  {PROVIDER_OPTIONS.map((opt) => {
                    const selected = opt.value === provider;
                    return (
                      <li key={opt.value} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          onClick={() => {
                            setProvider(opt.value);
                            setProviderOpen(false);
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-[5px] border-none px-2.5 py-1.5 text-left text-[0.8rem] transition-colors duration-100 sm:text-[0.82rem] ${
                            selected
                              ? "bg-accent-bg/25 font-medium text-white"
                              : "bg-transparent text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          {selected && (
                            <span className="text-[0.72rem] text-[#60a5fa]">✓</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="llm-api-key-input"
                className="text-[0.74rem] font-semibold text-text-secondary sm:text-[0.78rem]"
              >
                API Key
              </label>
              {trimmedKey && (
                <span className="rounded-[4px] border border-status-ok/28 bg-status-ok/10 px-[6px] py-0.5 font-mono text-[0.68rem] text-status-ok sm:text-[0.72rem]">
                  Terdeteksi: {detectedLabel} ({maskApiKey(trimmedKey)})
                </span>
              )}
            </div>
            <div className="flex gap-1.5 sm:gap-2">
              <input
                id="llm-api-key-input"
                type={showKey ? "text" : "password"}
                className="w-full rounded-[6px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 font-mono text-[0.82rem] text-text-primary outline-none focus:border-border-focus sm:py-2 sm:text-[0.84rem]"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="Tempel API key (AIza..., sk-..., gsk_...)"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded-[6px] border border-border-subtle bg-transparent px-2.5 py-1 text-[0.76rem] font-medium text-text-secondary transition-colors duration-150 hover:bg-bg-surface hover:text-text-primary sm:px-[11px] sm:text-[0.8rem]"
                onClick={() => setShowKey((prev) => !prev)}
              >
                {showKey ? "Sembunyi" : "Lihat"}
              </button>
            </div>
            {errorMsg && (
              <div className="text-[0.74rem] text-[#f87171]">{errorMsg}</div>
            )}
          </div>

          <div className="rounded-[10px] border border-border-subtle bg-bg-surface">
            <button
              type="button"
              onClick={() => setSecurityOpen((prev) => !prev)}
              aria-expanded={securityOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border-none bg-transparent px-3 py-2.5 text-left transition-colors duration-150 hover:bg-bg-surface-hover/50"
            >
              <span className="text-[0.74rem] font-semibold text-status-ok sm:text-[0.78rem]">
                Keamanan dan Privasi Kunci API
              </span>
              <svg
                className={`shrink-0 text-status-ok transition-transform duration-200 ease-out ${
                  securityOpen ? "rotate-180" : ""
                }`}
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                securityOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <ul className="m-0 flex list-disc flex-col gap-1 border-t border-border-subtle/60 px-3 pt-2 pb-2.5 pl-6 text-[0.71rem] leading-[1.4] text-text-secondary sm:text-[0.75rem]">
                  <li>
                    <strong className="text-text-primary">
                      Hanya di Memori Browser:
                    </strong>{" "}
                    Kunci hanya tersimpan sementara selama tab ini dibuka (tidak masuk{" "}
                    <code className="font-mono text-[0.69rem] text-text-primary">
                      localStorage
                    </code>
                    /cookie) dan otomatis hilang begitu halaman dimuat ulang.
                  </li>
                  <li>
                    <strong className="text-text-primary">
                      Tidak Dicatat di Server:
                    </strong>{" "}
                    Kunci dikirim melalui header{" "}
                    <code className="font-mono text-[0.69rem] text-text-primary">
                      X-LLM-API-Key
                    </code>{" "}
                    hanya untuk memproses pertanyaan saat itu, tanpa disimpan ke database.
                  </li>
                  <li>
                    <strong className="text-text-primary">
                      Koneksi Resmi &amp; Sensor Log:
                    </strong>{" "}
                    Server hanya meneruskan permintaan ke penyedia AI resmi via HTTPS dan otomatis menyensor kunci pada seluruh catatan log.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {!trimmedKey && (
            <div className="text-[0.71rem] leading-[1.4] text-text-muted sm:text-[0.75rem]">
              Status: Belum ada kunci API (jawaban akan diambil langsung dari basis data FAQ resmi kampus).
            </div>
          )}

          <div className="flex flex-wrap-reverse items-center justify-between gap-2 pt-0.5 sm:flex-nowrap">
            {currentConfig?.apiKey ? (
              <button
                type="button"
                className="cursor-pointer rounded-[6px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-2.5 py-1.5 text-[0.76rem] font-medium text-[#fca5a5] transition-colors duration-150 hover:bg-[#ef4444]/20 sm:px-[11px] sm:text-[0.8rem]"
                onClick={handleClearKey}
              >
                Hapus Key
              </button>
            ) : (
              <span className="hidden sm:inline" />
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-[6px] border border-border-subtle bg-transparent px-2.5 py-1.5 text-[0.76rem] font-medium text-text-secondary transition-colors duration-150 hover:bg-bg-surface hover:text-text-primary sm:px-[11px] sm:text-[0.8rem]"
                onClick={onClose}
              >
                Batal
              </button>
              <button
                type="submit"
                className="cursor-pointer rounded-[6px] border border-border-focus bg-accent-bg px-3 py-1.5 text-[0.78rem] font-medium text-white transition-colors duration-150 hover:bg-accent-bg-hover sm:px-3.5 sm:text-[0.82rem]"
              >
                Gunakan Kunci Ini
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
