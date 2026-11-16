# Chatbot FAQ Prodi TI (Django + RAG Mini + React 19)

Mini proyek Sistem Cerdas — **Chatbot FAQ ber-LLM** menggunakan **Django** (TF-IDF RAG Mini + Gemini API + Cache-Aside) dan **React 19 + TypeScript + Vite** bertema hitam muda minimalis. Aplikasi ini melayani tanya jawab seputar **Program Studi Teknologi Informasi, Praktikum Laboratorium, dan Magang/PKL**.

## Fitur Utama
- **Basis Pengetahuan FAQ di PostgreSQL / SQLite + Django Admin** (`faq.models.FAQ`): menyimpan kategori, pertanyaan, kata kunci (`keywords`), jawaban, dan sumber. Mendukung **PostgreSQL** (`DB_ENGINE=postgres`) dengan fallback **SQLite**, dapat dikelola via `/admin/` dan di-seed ulang secara idempoten melalui `python manage.py seed_faqs`.
- **RAG Mini (`faq/services/rag.py`)**: mengambil Top-3 FAQ paling relevan menggunakan **TF-IDF + Cosine Similarity** (`scikit-learn`) beserta skor kemiripannya. Pertanyaan di luar domain ditolak dengan sopan (`no_context`).
- **Integrasi LLM Gemini (`faq/services/llm.py`)**: memakai SDK `google-genai` (`GEMINI_API_KEY` dari `.env`) dengan pagar anti-halusinasi agar jawaban hanya merujuk konteks FAQ yang ditemukan, dilengkapi fallback model berantai dan **fallback otomatis ke referensi lokal** bila API tidak tersedia/offline.
- **Cache-Aside & Post-Commit Invalidation (`faq/services/cache.py`, `faq/signals.py`)**: menyimpan daftar FAQ aktif, indeks matriks TF-IDF, dan jawaban pertanyaan mandiri menggunakan TTL (`LocMemCache`), serta otomatis meng-invalidate cache via sinyal `post_save`/`post_delete` (`transaction.on_commit`).
- **Frontend React 19 (`frontend/src/`)**: SPA React + TypeScript + Vite (CSS murni dengan *design tokens* `#141518`), arsitektur modular (`hooks/`, `components/`, `api/` dengan *in-flight deduplication*), sidebar filter FAQ, dukungan `Enter`/`Shift+Enter`/shortcut `/`, dan reset percakapan.

## Struktur Folder
```text
chatbot-faq-prodi-ti/
├── config/                  # Pengaturan Django, URL utama, WSGI/ASGI
├── faq/
│   ├── data/faqs_prodi_ti.json          # Dataset 12 entri FAQ terkurasi
│   ├── management/commands/seed_faqs.py # Seeder idempoten ke SQLite
│   ├── services/cache.py                # Cache-Aside FAQ, TF-IDF, & LLM reply
│   ├── services/rag.py                  # Retriever TF-IDF + Cosine Similarity
│   ├── services/llm.py                  # Integrasi Gemini + anti-halusinasi + fallback
│   ├── signals.py                       # Explicit cache invalidation pasca-mutasi FAQ
│   ├── static/spa/                      # Output build React (dibuat via make fe-build)
│   ├── admin.py, apps.py, models.py, views.py, urls.py, tests.py
├── frontend/                # Aplikasi React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── api/chatApi.ts               # Klien fetch + CSRF + in-flight dedup
│   │   ├── hooks/                       # useChatSession.ts, useFaqCatalog.ts
│   │   ├── components/                  # HeaderBar, FaqSidebar, ChatMessageBubble, ChatComposer
│   │   ├── styles/tokens.css            # Design tokens tema hitam muda
│   │   ├── types/chat.ts
│   │   └── App.tsx, App.css, main.tsx
│   ├── package.json, tsconfig.json, vite.config.ts
├── .env.example
├── Makefile
├── manage.py
├── requirements.txt
└── README.md
```

## Sumber & Lisensi Dataset
- **Dataset**: `faq/data/faqs_prodi_ti.json` (12 entri FAQ mencakup Profil Prodi TI, Persiapan & Tata Tertib Lab, Penilaian Praktikum, Troubleshooting Lab, Syarat/Alur/Durasi/Pembimbing/Luaran Magang, dan Layanan Konsultasi).
- **Sumber**: Kurasi mandiri mengacu pada panduan akademik, SOP praktikum laboratorium, RPS Sistem Cerdas, dan pedoman Magang/PKL Program Studi Teknologi Informasi Politeknik Negeri Madiun.
- **Lisensi**: CC-BY-4.0 (bebas digunakan dan dimodifikasi untuk keperluan edukasi dengan mencantumkan atribusi).

## Cara Menjalankan
1. **Clone repositori dan salin `.env`:**
   ```bash
   git clone https://github.com/cpzz18/chatbot-faq-prodi-ti.git
   cd chatbot-faq-prodi-ti
   cp .env.example .env
   ```
   Isi `GEMINI_API_KEY` serta kredensial PostgreSQL lokal pada file `.env` (atau ubah `DB_ENGINE=sqlite` jika ingin tanpa database server).

2. **Setup & jalankan via `Makefile`:**
   ```bash
   make setup      # instal dep BE+FE, build React ke Django static, migrate DB, & seed FAQ
   make run        # jalankan server di http://127.0.0.1:8000/
   ```
   *(Opsional)* Buat akun admin untuk mengelola FAQ via `/admin/`:
   ```bash
   make superuser
   ```
   Untuk mode pengembangan frontend dengan HMR:
   ```bash
   # Terminal 1 (Backend API)
   make run

   # Terminal 2 (Vite Dev Server :5173 -> proxy /api ke :8000)
   make fe-dev
   ```

## Pengujian Otomatis
```bash
make fe-check   # TypeScript typecheck
make check      # Django system check
make test       # Unit & integration tests (9 tests)
```

## Identitas Pengembang (Tugas Mandiri)
- **Nama / NIM:** Robbin Chandra Falla A (`253307059`)
- **Program Studi:** Teknologi Informasi — Politeknik Negeri Madiun
- **Cakupan:** Arsitektur Django + PostgreSQL/SQLite, RAG Mini (`scikit-learn` TF-IDF), Cache-Aside & Signals Invalidation, Integrasi Gemini API, Kurasi Dataset FAQ, serta Frontend React 19.
