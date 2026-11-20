import { useEffect, useRef, useState } from "react";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ChatComposer } from "./components/ChatComposer";
import { ChatMessageBubble } from "./components/ChatMessageBubble";
import { FaqSidebar } from "./components/FaqSidebar";
import { HeaderBar } from "./components/HeaderBar";
import { useChatSession } from "./hooks/useChatSession";
import { useFaqCatalog } from "./hooks/useFaqCatalog";
import "./App.css";

const WELCOME_HEADLINES = [
  { wave: true, text: "Halo! Ada yang ingin ditanyakan seputar Prodi TI?" },
  { wave: false, text: "Cek info praktikum lab, magang PKL, dan kurikulum." },
  { wave: false, text: "Butuh info akreditasi, SIAKAD, atau Tugas Akhir?" },
  { wave: false, text: "Tanyakan layanan akademik Prodi TI di sini." },
];

export function App() {
  const {
    messages,
    faqCount,
    isHydrating,
    isSending,
    notice,
    apiKeyConfig,
    setApiKeyConfig,
    sendMessage,
    clearSession,
  } = useChatSession();

  const {
    groups,
    totalCount,
    searchQuery,
    setSearchQuery,
    isLoading: isCatalogLoading,
    error: catalogError,
    retry: retryCatalog,
  } = useFaqCatalog();

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth > 820 : true
  );
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState<boolean>(false);
  const [headlineIndex, setHeadlineIndex] = useState<number>(0);
  const [typedCount, setTypedCount] = useState<number>(0);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const resolvedFaqCount = faqCount || totalCount;
  const isWelcome = !isHydrating && messages.length === 0;
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.text ?? null;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (isWelcome) {
      setHeadlineIndex(0);
      setTypedCount(0);
    }
  }, [isWelcome]);

  useEffect(() => {
    if (!isWelcome) return;
    const chars = Array.from(WELCOME_HEADLINES[headlineIndex].text);

    if (typedCount < chars.length) {
      const typeTimer = window.setTimeout(() => {
        setTypedCount((prev) => prev + 1);
      }, 32);
      return () => window.clearTimeout(typeTimer);
    }

    const holdTimer = window.setTimeout(() => {
      setTypedCount(0);
      setHeadlineIndex((prev) => (prev + 1) % WELCOME_HEADLINES.length);
    }, 2800);
    return () => window.clearTimeout(holdTimer);
  }, [isWelcome, headlineIndex, typedCount]);

  function handleSelectSidebarQuestion(question: string) {
    if (typeof window !== "undefined" && window.innerWidth <= 820) {
      setSidebarOpen(false);
    }
    void sendMessage(question);
  }

  return (
    <div className="workspace">
      <HeaderBar
        faqCount={resolvedFaqCount}
        sidebarOpen={sidebarOpen}
        hasMessages={messages.length > 0}
        isSending={isSending}
        apiKeyConfig={apiKeyConfig}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
        onClearSession={() => void clearSession()}
      />

      <div className="shell-body">
        <FaqSidebar
          open={sidebarOpen}
          groups={groups}
          searchQuery={searchQuery}
          activeQuestion={lastUserMessage}
          isLoading={isCatalogLoading}
          error={catalogError}
          isSending={isSending}
          onSearchChange={setSearchQuery}
          onSelectQuestion={handleSelectSidebarQuestion}
          onRetry={retryCatalog}
        />

        <main className={`chat-panel ${isWelcome ? "is-welcome" : ""}`}>
          {notice && (
            <div className="toast-notice" role="status" aria-live="polite">
              <span className="toast-dot" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}
          <div className="thread-scroll">
            {isHydrating ? (
              <div className="welcome-view">
                <div className="notice-line">Memuat sesi percakapan...</div>
              </div>
            ) : isWelcome ? (
              <div className="welcome-hero">
                <div className="welcome-hero-head">
                  <h1 className="welcome-hero-headline">
                    {WELCOME_HEADLINES[headlineIndex].wave && (
                      <span className="wave-hand" aria-hidden="true">
                        👋
                      </span>
                    )}
                    <span className="welcome-hero-typed">
                      {Array.from(WELCOME_HEADLINES[headlineIndex].text)
                        .slice(0, typedCount)
                        .join("")}
                    </span>
                  </h1>
                </div>

                <ChatComposer
                  variant="hero"
                  isSending={isSending}
                  onSend={sendMessage}
                />
              </div>
            ) : (
              <div className="thread-inner">
                {messages.map((msg, idx) => (
                  <ChatMessageBubble key={`${msg.role}-${idx}`} message={msg} />
                ))}
                {isSending && (
                  <article className="message-row bot" aria-live="polite">
                    <div className="message-role">Asisten TI</div>
                    <div className="message-bubble loading-bubble">
                      <div className="typing-indicator" aria-label="Sedang menyusun jawaban">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </div>
                      <span className="loading-text">Menyusun jawaban...</span>
                    </div>
                  </article>
                )}
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {!isWelcome && !isHydrating && (
            <ChatComposer
              variant="docked"
              isSending={isSending}
              onSend={sendMessage}
            />
          )}
        </main>
      </div>

      <ApiKeyModal
        open={apiKeyModalOpen}
        currentConfig={apiKeyConfig}
        onSave={setApiKeyConfig}
        onClose={() => setApiKeyModalOpen(false)}
      />
    </div>
  );
}

export default App;
