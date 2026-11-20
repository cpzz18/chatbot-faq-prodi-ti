import { useState } from "react";
import type { FaqCategoryGroup } from "../hooks/useFaqCatalog";

interface FaqSidebarProps {
  open: boolean;
  groups: FaqCategoryGroup[];
  searchQuery: string;
  activeQuestion?: string | null;
  isLoading: boolean;
  error: string | null;
  isSending: boolean;
  onSearchChange: (value: string) => void;
  onSelectQuestion: (question: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

export function FaqSidebar({
  open,
  groups,
  searchQuery,
  activeQuestion,
  isLoading,
  error,
  isSending,
  onSearchChange,
  onSelectQuestion,
  onClose,
  onRetry,
}: FaqSidebarProps) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const isSearching = searchQuery.trim().length > 0;

  function isGroupOpen(category: string, index: number): boolean {
    if (isSearching) return true;
    if (category in openMap) return openMap[category];
    return index === 0;
  }

  function toggleGroup(category: string, index: number) {
    const current = category in openMap ? openMap[category] : index === 0;
    setOpenMap((prev) => ({ ...prev, [category]: !current }));
  }

  return (
    <aside
      aria-hidden={!open}
      className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-border-subtle bg-bg-sidebar transition-[transform,width,opacity] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,width,opacity] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-[82%] max-md:max-w-[300px] max-md:border-r max-md:shadow-[12px_0_32px_rgba(0,0,0,0.45)] ${
        open
          ? "translate-x-0 opacity-100 md:w-[288px] md:border-r"
          : "pointer-events-none -translate-x-full opacity-0 md:w-0 md:border-r-0"
      }`}
      aria-label="Basis pengetahuan FAQ"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col md:w-[288px]">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.72rem] font-semibold tracking-[0.06em] text-text-muted uppercase">
            Topik FAQ Prodi TI
          </span>
          <button
            type="button"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[4px] border border-border-subtle bg-transparent text-xs text-text-secondary hover:bg-bg-surface hover:text-text-primary md:hidden"
            onClick={onClose}
            aria-label="Tutup panel topik"
          >
            ✕
          </button>
        </div>
        <div className="relative flex items-center">
          <svg
            className="pointer-events-none absolute left-2.5 text-text-muted"
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="7"
              cy="7"
              r="5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M11 11L14 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            className="w-full rounded-[6px] border border-border-subtle bg-bg-surface py-[7px] pr-7 pl-[30px] text-base text-text-primary transition-colors duration-150 outline-none placeholder:text-text-muted focus:border-border-focus sm:text-[0.81rem]"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari topik atau kata kunci..."
            aria-label="Filter daftar FAQ"
          />
          {isSearching && (
            <button
              type="button"
              className="absolute right-1.5 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-[0.95rem] leading-none text-text-muted hover:bg-bg-surface-hover hover:text-text-primary"
              onClick={() => onSearchChange("")}
              aria-label="Hapus pencarian"
              title="Hapus pencarian"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-3">
        {isLoading ? (
          <div className="px-2 py-4 text-center text-[0.82rem] text-text-muted">
            Memuat daftar referensi...
          </div>
        ) : error ? (
          <div
            className="mx-1 my-2 flex flex-col items-center gap-2.5 rounded-[10px] border border-[#ef4444]/28 bg-[#ef4444]/8 p-3 text-center"
            role="alert"
          >
            <p className="m-0 text-[0.78rem] leading-[1.45] text-[#fca5a5]">
              {error}
            </p>
            <button
              type="button"
              className="cursor-pointer rounded-[6px] border border-border-subtle bg-transparent px-2.5 py-1 text-[0.75rem] font-medium text-text-secondary transition-colors duration-150 hover:bg-bg-surface hover:text-text-primary"
              onClick={onRetry}
            >
              Coba Lagi
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-2 py-4 text-center text-[0.82rem] text-text-muted">
            Tidak ada topik yang cocok.
          </div>
        ) : (
          groups.map((group, index) => {
            const expanded = isGroupOpen(group.category, index);
            return (
              <div key={group.category}>
                <button
                  type="button"
                  className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-[6px] border-none bg-transparent px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[#1b2e59]/35"
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.category, index)}
                >
                  <span
                    className={`text-[0.81rem] font-semibold transition-colors duration-150 group-hover:text-[#f8fafc] ${
                      expanded ? "text-[#f8fafc]" : "text-text-secondary"
                    }`}
                  >
                    {group.category}
                  </span>
                  <span className="inline-flex shrink-0 items-center text-text-muted">
                    <svg
                      className={`transition-transform duration-180 ${
                        expanded ? "rotate-90 text-[#60a5fa]" : ""
                      }`}
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 4L10 8L6 12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>

                {expanded && (
                  <ul className="mt-0.5 mb-2 ml-3 flex list-none flex-col gap-0.5 border-l border-border-subtle py-0 pr-0 pl-2.5">
                    {group.items.map((item) => {
                      const isActive = activeQuestion === item.question;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`w-full cursor-pointer rounded-r-[6px] border-none border-l-2 px-2.5 py-1.5 text-left text-[0.8rem] leading-[1.42] transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-50 ${
                              isActive
                                ? "border-l-[#3b82f6] bg-[#2563eb]/16 font-medium text-white"
                                : "border-l-transparent bg-transparent text-text-secondary hover:enabled:bg-[#1b2e59]/35 hover:enabled:text-[#f8fafc]"
                            }`}
                            disabled={isSending}
                            onClick={() => onSelectQuestion(item.question)}
                          >
                            {item.question}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
        </div>
      </div>
    </aside>
  );
}
