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
  { wave: true, text: "Ada yang ingin ditanyakan seputar perkuliahan TI?" },
  { wave: false, text: "Cek praktikum lab, magang PKL, dan kurikulum semester." },
  { wave: false, text: "Panduan SIAKAD, syarat Tugas Akhir, hingga akreditasi." },
  { wave: false, text: "Informasi resmi layanan akademik D-III TI PNM." },
];

const QUICK_PROMPTS = [
  "Apa visi dan misi Prodi TI PNM?",
  "Syarat & alur magang PKL",
  "Tata tertib praktikum lab",
  "Info akreditasi & Tugas Akhir",
];

export function App() {
  const {
    messages,
    faqCount,
    quickPrompts,
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
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
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
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    void sendMessage(question);
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg-base">
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

      <div className="relative flex min-h-0 flex-1">
        <div
          className={`fixed inset-0 top-[54px] z-15 bg-black/60 backdrop-blur-[2px] transition-opacity duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden ${
            sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />

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
          onClose={() => setSidebarOpen(false)}
          onRetry={retryCatalog}
        />

        <main
          className={`relative flex min-w-0 flex-1 flex-col bg-bg-base ${
            isWelcome
              ? "bg-[radial-gradient(ellipse_62%_52%_at_50%_44%,rgba(37,99,235,0.16)_0%,rgba(29,78,216,0.06)_42%,transparent_74%)]"
              : ""
          }`}
        >
          {notice && (
            <div
              className="animate-toast pointer-events-none absolute top-3 right-3 z-45 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-[10px] border border-border-subtle bg-[#0f1624]/94 px-3 py-1.5 text-[0.76rem] font-medium text-[#f8fafc] shadow-[0_12px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:top-4 sm:right-5 sm:max-w-[380px] sm:px-3.5 sm:py-2 sm:text-[0.8rem]"
              role="status"
              aria-live="polite"
            >
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.55)]"
                aria-hidden="true"
              />
              <span>{notice}</span>
            </div>
          )}
          <div
            className={`no-scrollbar flex-1 overflow-y-auto ${
              isWelcome
                ? "flex flex-col justify-center px-3 pt-4 pb-6 sm:px-5 sm:pt-6 sm:pb-9"
                : "px-3 pt-4 pb-2 sm:px-5 sm:pt-6 sm:pb-3"
            }`}
          >
            {isHydrating ? (
              <div className="mx-auto mt-12 flex max-w-[920px] flex-col gap-5">
                <div className="rounded-[6px] border border-border-subtle bg-bg-surface px-3 py-2 text-[0.82rem] text-text-secondary">
                  Memuat sesi percakapan...
                </div>
              </div>
            ) : isWelcome ? (
              <div className="animate-message mx-auto flex w-full max-w-[660px] flex-col items-center gap-4 pb-[4vh] sm:gap-5 sm:pb-[8vh]">
                <div className="flex flex-col items-center gap-2.5 px-1 text-center">
                  <h1 className="m-0 min-h-[3.2rem] text-[1.22rem] leading-[1.32] font-semibold tracking-[-0.025em] sm:min-h-[2.35rem] sm:text-[1.5rem] md:text-[1.72rem]">
                    {WELCOME_HEADLINES[headlineIndex].wave && (
                      <span
                        className="animate-wave mr-2 inline-block sm:mr-2.5"
                        aria-hidden="true"
                      >
                        👋
                      </span>
                    )}
                    <span className="text-[#f8fafc]">
                      {Array.from(WELCOME_HEADLINES[headlineIndex].text)
                        .slice(0, typedCount)
                        .join("")}
                    </span>
                  </h1>

                  <p className="m-0 max-w-[440px] text-[0.78rem] leading-[1.45] text-text-muted sm:text-[0.84rem]">
                    Pusat informasi perkuliahan, jadwal praktikum laboratorium, dan pedoman magang mahasiswa D-III TI PNM.
                  </p>
                </div>

                <ChatComposer
                  variant="hero"
                  isSending={isSending}
                  onSend={sendMessage}
                />

                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  {(quickPrompts.length > 0 ? quickPrompts : QUICK_PROMPTS)
                    .slice(0, 4)
                    .map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={isSending}
                        onClick={() => void sendMessage(prompt)}
                        className="cursor-pointer rounded-full border border-border-subtle bg-bg-surface/65 px-3 py-1.5 text-[0.74rem] text-text-secondary transition-colors duration-150 hover:border-border-focus/70 hover:bg-bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 sm:text-[0.78rem]"
                      >
                        {prompt}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-[920px] flex-col gap-4 sm:gap-[22px]">
                {messages.map((msg, idx) => (
                  <ChatMessageBubble key={`${msg.role}-${idx}`} message={msg} />
                ))}
                {isSending && (
                  <article
                    className="animate-message flex flex-col items-start gap-1.5"
                    aria-live="polite"
                  >
                    <div className="px-0.5 text-[0.72rem] font-semibold text-text-muted">
                      Asisten TI
                    </div>
                    <div className="inline-flex w-auto items-center gap-2.5 rounded-[16px] rounded-bl-[4px] border border-border-subtle bg-bg-surface px-[18px] py-3 text-[0.94rem] leading-[1.65] text-text-secondary shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
                      <div
                        className="inline-flex h-[18px] items-center gap-[5px]"
                        aria-label="Sedang menyusun jawaban"
                      >
                        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-text-secondary opacity-35 [animation-delay:0s]" />
                        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-text-secondary opacity-35 [animation-delay:0.18s]" />
                        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-text-secondary opacity-35 [animation-delay:0.36s]" />
                      </div>
                      <span className="text-[0.84rem] text-text-muted">
                        Menyusun jawaban...
                      </span>
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
