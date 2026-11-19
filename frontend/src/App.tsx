import { useEffect, useRef, useState } from "react";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ChatComposer } from "./components/ChatComposer";
import { ChatMessageBubble } from "./components/ChatMessageBubble";
import { FaqSidebar } from "./components/FaqSidebar";
import { HeaderBar } from "./components/HeaderBar";
import { useChatSession } from "./hooks/useChatSession";
import { useFaqCatalog } from "./hooks/useFaqCatalog";
import "./App.css";

export function App() {
  const {
    messages,
    faqCount,
    quickPrompts,
    isHydrating,
    isSending,
    notice,
    apiKeyConfig,
    serverLlmConfigured,
    serverProvider,
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
  } = useFaqCatalog();

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth > 820 : true
  );
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState<boolean>(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  function handleSelectSidebarQuestion(question: string) {
    if (typeof window !== "undefined" && window.innerWidth <= 820) {
      setSidebarOpen(false);
    }
    void sendMessage(question);
  }

  const resolvedFaqCount = faqCount || totalCount;

  return (
    <div className="workspace">
      <HeaderBar
        faqCount={resolvedFaqCount}
        sidebarOpen={sidebarOpen}
        hasMessages={messages.length > 0}
        isSending={isSending}
        apiKeyConfig={apiKeyConfig}
        serverLlmConfigured={serverLlmConfigured}
        serverProvider={serverProvider}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
        onClearSession={() => void clearSession()}
      />

      <div className="shell-body">
        <FaqSidebar
          open={sidebarOpen}
          groups={groups}
          searchQuery={searchQuery}
          isLoading={isCatalogLoading}
          isSending={isSending}
          onSearchChange={setSearchQuery}
          onSelectQuestion={handleSelectSidebarQuestion}
        />

        <main className="chat-panel">
          <div className="thread-scroll">
            {isHydrating ? (
              <div className="welcome-view">
                <div className="notice-line">Memuat sesi percakapan...</div>
              </div>
            ) : messages.length === 0 ? (
              <div className="welcome-view">
                <div className="welcome-heading">
                  <h1>Asisten FAQ Prodi Teknologi Informasi</h1>
                  <p>
                    Tanyakan aturan praktikum laboratorium, komponen penilaian,
                    syarat dan alur magang/PKL, atau pilih topik langsung dari
                    panel sebelah kiri.
                  </p>
                </div>

                {notice && <div className="notice-line">{notice}</div>}

                <div className="starter-grid">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="starter-card"
                      disabled={isSending}
                      onClick={() => void sendMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="thread-inner">
                {messages.map((msg, idx) => (
                  <ChatMessageBubble key={`${msg.role}-${idx}`} message={msg} />
                ))}
                {isSending && (
                  <article className="message-row bot">
                    <div className="message-role">Asisten TI</div>
                    <div className="message-bubble loading-bubble">
                      Mencari referensi FAQ dan menyusun jawaban...
                    </div>
                  </article>
                )}
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          <ChatComposer isSending={isSending} onSend={sendMessage} />
        </main>
      </div>

      <ApiKeyModal
        open={apiKeyModalOpen}
        currentConfig={apiKeyConfig}
        serverLlmConfigured={serverLlmConfigured}
        serverProvider={serverProvider}
        onSave={setApiKeyConfig}
        onClose={() => setApiKeyModalOpen(false)}
      />
    </div>
  );
}

export default App;
