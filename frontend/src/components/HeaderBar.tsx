interface HeaderBarProps {
  faqCount: number;
  sidebarOpen: boolean;
  hasMessages: boolean;
  isSending: boolean;
  onToggleSidebar: () => void;
  onClearSession: () => void;
}

export function HeaderBar({
  faqCount,
  sidebarOpen,
  hasMessages,
  isSending,
  onToggleSidebar,
  onClearSession,
}: HeaderBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Tutup panel topik" : "Buka panel topik"}
          title={sidebarOpen ? "Tutup panel topik" : "Buka panel topik"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <line
              x1="5.5"
              y1="2.5"
              x2="5.5"
              y2="13.5"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
        </button>

        <div className="brand">
          <span className="brand-title">Asisten Akademik TI</span>
          <span className="brand-meta">
            <span className="status-dot" aria-hidden="true" />
            {faqCount} referensi aktif
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <a
          className="ghost-link"
          href="/admin/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Admin
        </a>
        <button
          type="button"
          className="ghost-btn"
          onClick={onClearSession}
          disabled={!hasMessages || isSending}
        >
          Bersihkan
        </button>
      </div>
    </header>
  );
}
