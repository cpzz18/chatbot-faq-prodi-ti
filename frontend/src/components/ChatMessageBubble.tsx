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
    <article className={`message-row ${message.role}`}>
      <div className="message-role">{isBot ? "Asisten TI" : "Anda"}</div>
      <div className="message-bubble">
        {isBot ? <MarkdownContent content={message.text} /> : message.text}
      </div>

      {isBot && modeLabel && (
        <footer className="message-meta">
          <span
            className={`meta-tag ${
              message.mode === "rag_llm" ? "meta-tag-active" : "meta-tag-muted"
            }`}
          >
            {modeLabel}
          </span>
          {(message.sources ?? []).map((src, idx) => (
            <span className="meta-source" key={`${src.source}-${idx}`}>
              {src.source} · {Math.round(src.score * 100)}%
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}
