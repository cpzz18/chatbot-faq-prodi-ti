import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const MAX_LENGTH = 500;

interface ChatComposerProps {
  isSending: boolean;
  variant?: "docked" | "hero";
  onSend: (text: string) => Promise<void>;
}

export function ChatComposer({
  isSending,
  variant = "docked",
  onSend,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      const activeTag = document.activeElement?.tagName;
      const modalOpen = Boolean(document.querySelector(".modal-backdrop"));
      if (
        event.key === "/" &&
        !modalOpen &&
        activeTag !== "INPUT" &&
        activeTag !== "TEXTAREA" &&
        activeTag !== "SELECT"
      ) {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  async function submitCurrentValue() {
    const trimmed = value.trim();
    if (!trimmed || isSending) return;
    setValue("");
    await onSend(trimmed);
    textareaRef.current?.focus();
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submitCurrentValue();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentValue();
    }
  }

  return (
    <div className={`composer-shell ${variant === "hero" ? "composer-hero" : ""}`}>
      <form className="composer-box" onSubmit={handleFormSubmit}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          placeholder="Tanyakan seputar Prodi TI, praktikum lab, atau magang... (tekan / untuk fokus)"
          aria-label="Ketik pertanyaan"
        />
        <div className="composer-footer">
          <span className="composer-hint">
            Enter kirim · Shift+Enter baris baru · {value.length}/{MAX_LENGTH}
          </span>
          <button
            type="submit"
            className="send-btn"
            disabled={isSending || !value.trim()}
          >
            {isSending ? "Memproses..." : "Kirim"}
          </button>
        </div>
      </form>
    </div>
  );
}
