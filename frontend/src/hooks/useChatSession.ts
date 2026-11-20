import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchChatState,
  resetChatHistory,
  sendChatMessage,
} from "../api/chatApi";
import type { ApiKeyConfig, ChatMessage } from "../types/chat";

const DEFAULT_QUICK_PROMPTS = [
  "Apa visi dan misi Prodi TI PNM?",
  "Syarat & alur magang PKL",
  "Tata tertib praktikum lab",
  "Info akreditasi & Tugas Akhir",
];

export interface UseChatSessionResult {
  messages: ChatMessage[];
  faqCount: number;
  quickPrompts: string[];
  isHydrating: boolean;
  isSending: boolean;
  notice: string | null;
  apiKeyConfig: ApiKeyConfig | null;
  setApiKeyConfig: (config: ApiKeyConfig | null) => void;
  clearApiKey: () => void;
  sendMessage: (rawText: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

export function useChatSession(): UseChatSessionResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [faqCount, setFaqCount] = useState<number>(0);
  const [quickPrompts, setQuickPrompts] = useState<string[]>(DEFAULT_QUICK_PROMPTS);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  // RAM-only browser state: tidak pernah ditulis ke localStorage, sessionStorage, atau cookie.
  const [apiKeyConfig, setApiKeyConfigState] = useState<ApiKeyConfig | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchChatState()
      .then((state) => {
        if (!mounted) return;
        setMessages(state.history);
        setFaqCount(state.faq_count);
        if (Array.isArray(state.quick_prompts) && state.quick_prompts.length > 0) {
          setQuickPrompts(state.quick_prompts);
        }
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setApiKeyConfig = useCallback((config: ApiKeyConfig | null) => {
    if (!config || !config.apiKey.trim()) {
      setApiKeyConfigState(null);
      return;
    }
    setApiKeyConfigState({
      apiKey: config.apiKey.trim(),
      provider: config.provider,
    });
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyConfigState(null);
  }, []);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isSending) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setNotice(null);
      setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
      setIsSending(true);

      try {
        const res = await sendChatMessage(trimmed, apiKeyConfig, controller.signal);
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            text: res.reply,
            mode: res.mode,
            model: res.model,
            provider: res.provider,
            sources: res.sources,
            cached: res.cached,
          },
        ]);
      } catch (err) {
        if (controller.signal.aborted) {
          // Permintaan dibatalkan sengaja oleh pengguna saat reset
          return;
        }
        const errText =
          err instanceof Error
            ? err.message
            : "Gagal terhubung ke server. Silakan coba lagi.";
        setMessages((prev) => [...prev, { role: "bot", text: errText }]);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setIsSending(false);
        }
      }
    },
    [apiKeyConfig, isSending]
  );

  const clearSession = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSending(false);
    }
    try {
      await resetChatHistory();
      setMessages([]);
      setNotice("Riwayat percakapan telah dibersihkan.");
    } catch {
      setNotice("Gagal membersihkan riwayat percakapan.");
    }
  }, []);

  return {
    messages,
    faqCount,
    quickPrompts,
    isHydrating,
    isSending,
    notice,
    apiKeyConfig,
    setApiKeyConfig,
    clearApiKey,
    sendMessage,
    clearSession,
  };
}
