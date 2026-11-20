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
      const modalOpen = Boolean(document.querySelector('[role="dialog"]'));
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

  const isHero = variant === "hero";

  return (
    <div
      className={
        isHero
          ? "w-full bg-transparent p-0"
          : "bg-bg-base px-3 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-2 sm:pb-7"
      }
    >
      <form
        className={`mx-auto flex flex-col gap-1.5 border border-border-subtle transition-colors duration-150 focus-within:border-border-focus ${
          isHero
            ? "max-w-[620px] rounded-[14px] bg-[#0f1624]/92 px-3 py-2 shadow-[0_18px_42px_rgba(0,0,0,0.5)] backdrop-blur-sm focus-within:shadow-[0_0_0_1px_rgba(37,99,235,0.25),0_18px_44px_rgba(0,0,0,0.55)] sm:rounded-[16px] sm:px-4 sm:py-2.5"
            : "max-w-[780px] rounded-[14px] bg-bg-surface px-3 py-2 sm:rounded-[16px] sm:px-3.5 sm:py-2.5"
        }`}
        onSubmit={handleFormSubmit}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          className="no-scrollbar max-h-[120px] w-full resize-none border-none bg-transparent font-sans text-[0.9rem] leading-[1.45] text-text-primary outline-none placeholder:text-text-muted sm:text-[0.92rem]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          placeholder="Tulis pertanyaan seputar perkuliahan, praktikum, atau magang..."
          aria-label="Ketik pertanyaan"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.7rem] text-text-muted sm:hidden">
            {value.length}/{MAX_LENGTH}
          </span>
          <span className="hidden text-[0.72rem] text-text-muted sm:inline">
            Enter kirim · Shift+Enter baris baru · {value.length}/{MAX_LENGTH}
          </span>
          <button
            type="submit"
            className="ml-auto cursor-pointer rounded-[6px] border border-border-focus bg-accent-bg px-3 py-1 text-[0.78rem] font-medium text-white transition-colors duration-150 hover:enabled:bg-accent-bg-hover disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:py-1.5 sm:text-[0.82rem]"
            disabled={isSending || !value.trim()}
          >
            {isSending ? "Menjawab..." : "Kirim"}
          </button>
        </div>
      </form>
    </div>
  );
}
