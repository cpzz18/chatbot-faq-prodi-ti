import { useCallback, useEffect, useState } from "react";
import {
  fetchChatState,
  resetChatHistory,
  sendChatMessage,
} from "../api/chatApi";
import type { ChatMessage } from "../types/chat";

export interface UseChatSessionResult {
  messages: ChatMessage[];
  faqCount: number;
  quickPrompts: string[];
  isHydrating: boolean;
  isSending: boolean;
  notice: string | null;
  sendMessage: (rawText: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

export function useChatSession(): UseChatSessionResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [faqCount, setFaqCount] = useState<number>(0);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchChatState()
      .then((state) => {
        if (!mounted) return;
        setMessages(state.history);
        setFaqCount(state.faq_count);
        setQuickPrompts(state.quick_prompts);
      })
      .catch(() => {
        if (mounted) {
          setNotice("Tidak dapat memuat status percakapan dari server.");
        }
      })
      .finally(() => {
        if (mounted) setIsHydrating(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isSending) return;

      setNotice(null);
      setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
      setIsSending(true);

      try {
        const res = await sendChatMessage(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            text: res.reply,
            mode: res.mode,
            model: res.model,
            sources: res.sources,
            cached: res.cached,
          },
        ]);
      } catch (err) {
        const errText =
          err instanceof Error
            ? err.message
            : "Gagal terhubung ke server Django.";
        setMessages((prev) => [...prev, { role: "bot", text: errText }]);
      } finally {
        setIsSending(false);
      }
    },
    [isSending]
  );

  const clearSession = useCallback(async () => {
    if (isSending) return;
    try {
      await resetChatHistory();
      setMessages([]);
      setNotice("Riwayat percakapan telah dibersihkan.");
    } catch {
      setNotice("Gagal membersihkan riwayat percakapan.");
    }
  }, [isSending]);

  return {
    messages,
    faqCount,
    quickPrompts,
    isHydrating,
    isSending,
    notice,
    sendMessage,
    clearSession,
  };
}
