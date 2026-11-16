import type { FaqCategoryGroup } from "../hooks/useFaqCatalog";

interface FaqSidebarProps {
  open: boolean;
  groups: FaqCategoryGroup[];
  searchQuery: string;
  isLoading: boolean;
  isSending: boolean;
  onSearchChange: (value: string) => void;
  onSelectQuestion: (question: string) => void;
}

export function FaqSidebar({
  open,
  groups,
  searchQuery,
  isLoading,
  isSending,
  onSearchChange,
  onSelectQuestion,
}: FaqSidebarProps) {
  if (!open) return null;

  return (
    <aside className="sidebar" aria-label="Basis pengetahuan FAQ">
      <div className="sidebar-header">
        <span className="sidebar-label">Basis Pengetahuan</span>
        <input
          type="search"
          className="sidebar-search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter topik atau kata kunci..."
          aria-label="Filter daftar FAQ"
        />
      </div>

      <div className="sidebar-body">
        {isLoading ? (
          <div className="sidebar-empty">Memuat daftar referensi...</div>
        ) : groups.length === 0 ? (
          <div className="sidebar-empty">Tidak ada topik yang cocok.</div>
        ) : (
          groups.map((group) => (
            <div className="faq-group" key={group.category}>
              <div className="faq-group-title">{group.category}</div>
              <ul className="faq-group-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="faq-nav-item"
                      disabled={isSending}
                      onClick={() => onSelectQuestion(item.question)}
                    >
                      {item.question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
