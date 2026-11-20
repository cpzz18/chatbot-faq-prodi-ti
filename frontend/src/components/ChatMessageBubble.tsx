import type { ChatMessage } from "../types/chat";
import { getProviderLabel } from "../utils/providerDetect";
import { MarkdownContent } from "./MarkdownContent";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isBot = message.role === "bot";

  const getModeLabel = (): string | null => {
    if (!message.mode) return null;
    if (message.mode === "rag_llm") {
      const modelLabel = message.model ?? getProviderLabel(message.provider);
      return message.cached
        ? `RAG · ${modelLabel} · Cache`
        : `RAG · ${modelLabel}`;
    }
    if (message.mode === "fallback_faq") {
      return "Referensi Lokal";
    }
    return "Di Luar Cakupan";
  };

  const modeLabel = getModeLabel();

  return (
    <article
      className={`animate-message flex flex-col gap-1.5 ${
        isBot ? "items-start" : "items-end"
      }`}
    >
      <div className="px-0.5 text-[0.72rem] font-semibold text-text-muted">
        {isBot ? "Asisten TI" : "Anda"}
      </div>
      <div
        className={`text-[0.88rem] leading-[1.62] whitespace-pre-wrap break-normal [overflow-wrap:break-word] sm:text-[0.94rem] sm:leading-[1.65] ${
          isBot
            ? "w-full max-w-full rounded-[14px] rounded-bl-[4px] border border-border-subtle bg-bg-surface px-4 py-3.5 text-text-primary shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:rounded-[16px] sm:px-6 sm:py-5"
            : "max-w-[88%] rounded-[14px] rounded-br-[4px] border border-[#1e3a8a] bg-bg-user-bubble px-3.5 py-2.5 text-[#f8fafc] shadow-[0_4px_16px_rgba(0,0,0,0.3)] sm:max-w-[78%] sm:rounded-[16px] sm:px-[18px] sm:py-3"
        }`}
      >
        {isBot ? <MarkdownContent content={message.text} /> : message.text}
      </div>

      {isBot && modeLabel && (
        <footer className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span
            className={`rounded-[4px] border px-[7px] py-0.5 font-mono text-[0.72rem] ${
              message.mode === "rag_llm"
                ? "border-[#1d4ed8] bg-[#2563eb]/16 text-[#93c5fd]"
                : "border-border-subtle bg-transparent text-text-secondary"
            }`}
          >
            {modeLabel}
          </span>
          {(message.sources ?? []).map((src, idx) => (
            <span
              className="rounded-[4px] border border-border-subtle bg-[#1b2e59]/25 px-[7px] py-0.5 font-mono text-[0.72rem] text-text-secondary"
              key={`${src.source}-${idx}`}
            >
              {src.source} · {Math.round(src.score * 100)}%
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}
