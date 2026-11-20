import { useState } from "react";
import type { FaqCategoryGroup } from "../hooks/useFaqCatalog";

interface FaqSidebarProps {
  open: boolean;
  groups: FaqCategoryGroup[];
  searchQuery: string;
  activeQuestion?: string | null;
  isLoading: boolean;
  isSending: boolean;
  onSearchChange: (value: string) => void;
  onSelectQuestion: (question: string) => void;
}

export function FaqSidebar({
  open,
  groups,
  searchQuery,
  activeQuestion,
  isLoading,
  isSending,
  onSearchChange,
  onSelectQuestion,
}: FaqSidebarProps) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  if (!open) return null;

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
    <aside className="sidebar" aria-label="Basis pengetahuan FAQ">
      <div className="sidebar-header">
        <span className="sidebar-label">Topik FAQ Prodi TI</span>
        <div className="sidebar-search-wrap">
          <svg
            className="sidebar-search-icon"
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
            className="sidebar-search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari topik atau kata kunci..."
            aria-label="Filter daftar FAQ"
          />
          {isSearching && (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => onSearchChange("")}
              aria-label="Hapus pencarian"
              title="Hapus pencarian"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-body">
        {isLoading ? (
          <div className="sidebar-empty">Memuat daftar referensi...</div>
        ) : groups.length === 0 ? (
          <div className="sidebar-empty">Tidak ada topik yang cocok.</div>
        ) : (
          groups.map((group, index) => {
            const expanded = isGroupOpen(group.category, index);
            return (
              <div className="faq-group" key={group.category}>
                <button
                  type="button"
                  className={`faq-group-toggle ${expanded ? "is-open" : ""}`}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.category, index)}
                >
                  <span className="faq-group-title-text">{group.category}</span>
                  <span className="faq-group-right">
                    <span className="faq-group-count">{group.items.length}</span>
                    <svg
                      className="faq-chevron"
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
                  <ul className="faq-group-list">
                    {group.items.map((item) => {
                      const isActive = activeQuestion === item.question;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`faq-nav-item ${isActive ? "is-active" : ""}`}
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
    </aside>
  );
}
