import { useEffect, useState, type FormEvent } from "react";
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

  useEffect(() => {
    if (!open) return;
    setProvider(currentConfig?.provider ?? "auto");
    setApiKey(currentConfig?.apiKey ?? "");
    setShowKey(false);
    setErrorMsg(null);
  }, [open, currentConfig]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

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
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h2 id="api-key-modal-title">Konfigurasi API Key AI (BYOK)</h2>
            <p className="modal-subtitle">
              Gunakan API key pribadi (Gemini, OpenAI, Groq, Claude, OpenRouter,
              atau DeepSeek) untuk pengujian langsung.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="field-group">
            <label htmlFor="llm-provider-select">Provider AI</label>
            <select
              id="llm-provider-select"
              className="modal-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as LlmProvider)}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <div className="field-label-row">
              <label htmlFor="llm-api-key-input">API Key</label>
              {trimmedKey && (
                <span className="detect-badge">
                  Terdeteksi: {detectedLabel} ({maskApiKey(trimmedKey)})
                </span>
              )}
            </div>
            <div className="key-input-wrap">
              <input
                id="llm-api-key-input"
                type={showKey ? "text" : "password"}
                className="modal-input key-input"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="Tempel API key (AIza..., sk-..., gsk_..., sk-ant-...)"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="ghost-btn toggle-vis-btn"
                onClick={() => setShowKey((prev) => !prev)}
              >
                {showKey ? "Sembunyi" : "Lihat"}
              </button>
            </div>
            {errorMsg && <div className="field-error">{errorMsg}</div>}
          </div>

          <div className="security-card">
            <div className="security-card-title">
              Jaminan Keamanan &amp; Privasi Zero-Retention
            </div>
            <ul>
              <li>
                <strong>RAM-Only di Browser:</strong> Key hanya disimpan di
                memori tab saat ini (tidak ditulis ke <code>localStorage</code>{" "}
                atau <code>cookie</code>) dan otomatis musnah saat tab di-refresh
                atau ditutup.
              </li>
              <li>
                <strong>Tanpa Persistensi Server:</strong> Dikirim melalui HTTP
                Header sekali pakai (<code>X-LLM-API-Key</code>) — tidak pernah
                disimpan ke database, riwayat sesi, atau file server.
              </li>
              <li>
                <strong>Anti-SSRF &amp; Sensor Log:</strong> Server hanya
                menghubungi endpoint HTTPS resmi provider dan menyensor otomatis
                potongan key dari seluruh log error.
              </li>
            </ul>
          </div>

          {!trimmedKey && (
            <div className="server-status-note">
              Status saat ini: API Key belum disetel (pengguna wajib memasukkan API Key AI untuk mengaktifkan respons LLM, atau sistem akan berjalan dalam Mode Fallback FAQ Lokal).
            </div>
          )}

          <div className="modal-actions">
            {currentConfig?.apiKey ? (
              <button
                type="button"
                className="danger-btn"
                onClick={handleClearKey}
              >
                Hapus Key dari Memori
              </button>
            ) : (
              <span />
            )}

            <div className="modal-actions-right">
              <button type="button" className="ghost-btn" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="send-btn">
                Gunakan Key Ini
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
