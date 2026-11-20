# Chatbot FAQ Prodi TI (Django + RAG Mini + React 19)

Mini proyek Sistem Cerdas — **Chatbot FAQ ber-LLM** menggunakan **Django 5** (Pure-Python TF-IDF RAG + Multi-Provider BYOK LLM + Cache-Aside) dan **React 19 + TypeScript + Vite + Tailwind CSS v4** bertema **PNM Dark Blue**. Aplikasi ini melayani tanya jawab seputar **Program Studi D-III Teknologi Informasi Politeknik Negeri Madiun (PNM), Praktikum Laboratorium, dan Magang/PKL**.

## Fitur Utama
- **Basis Pengetahuan FAQ di PostgreSQL (Neon / Lokal) / SQLite + Django Admin** (`faq.models.FAQ`): menyimpan kategori, pertanyaan, kata kunci (`keywords`), jawaban, dan sumber. Mendukung `DATABASE_URL` PostgreSQL (siap serverless Neon.tech), PostgreSQL lokal (`DB_ENGINE=postgres`), maupun fallback otomatis ke **SQLite**, serta seeder idempoten via `python manage.py seed_faqs`.
- **Lightweight RAG Mini (`faq/services/rag.py`, `PureTfidfIndex`)**: mengambil Top-3 FAQ paling relevan menggunakan **TF-IDF (unigram + bigram) & Cosine Similarity** berbasis Python murni (tanpa dependensi berat `scikit-learn`/`numpy`, ramah limit 250 MB Vercel Serverless). Pertanyaan di luar domain ditolak secara jujur (`no_context`).
- **Multi-Provider BYOK LLM (`faq/services/llm.py`)**: mendukung **Gemini, OpenAI, Groq, Anthropic Claude, OpenRouter, dan DeepSeek** melalui HTTP header sekali pakai (`X-LLM-API-Key`, *RAM-only* di browser tanpa persistensi DB/session). Dilengkapi pagar anti-halusinasi, *working model affinity cache*, *transient retry* dengan *exponential backoff + jitter*, sensor log (`[REDACTED_KEY]`), serta **fallback otomatis ke referensi lokal** bila key belum dipasang/offline.
- **Cache-Aside, HTTP Caching & Observabilitas (`faq/services/cache.py`, `faq/signals.py`, `faq/views.py`)**:
  - Cache-Aside dengan TTL jitter untuk katalog FAQ aktif, bundel TF-IDF, dan jawaban pertanyaan mandiri, serta invalidasi otomatis via sinyal `post_save`/`post_delete` (`transaction.on_commit`).
  - `GET /api/faqs/` mendukung `ETag` & `304 Not Modified` (`stale-while-revalidate`), sementara endpoint chat/sesi menerapkan `Cache-Control: private, no-store` dan *rate limit* `30 req/min/IP`.
  - Probe `/healthz` (liveness) & `/readyz` (DB + cache check) serta propagasi `X-Request-ID`.
- **Frontend React 19 + Tailwind CSS v4 (`frontend/src/`)**: SPA React + TypeScript + Vite dengan `@tailwindcss/vite`, tema gelap PNM Blue (`@theme` di `App.css`), modal konfigurasi API Key BYOK dengan auto-deteksi provider, renderer Markdown kaya (tabel, code block, list), sidebar akordeon berfilter, shortcut `/`, dan *Error Boundary*.

## Struktur Folder
```text
chatbot-faq-prodi-ti/
├── config/                  # Pengaturan Django (DATABASE_URL, WhiteNoise), URL utama, WSGI/ASGI
├── faq/
│   ├── data/faqs_prodi_ti.json          # Dataset 18 entri FAQ terkurasi Prodi TI PNM
│   ├── management/commands/seed_faqs.py # Seeder idempoten ke PostgreSQL / SQLite
│   ├── migrations/                      # Skema & constraint database
│   ├── services/cache.py                # Cache-Aside, TTL jitter, & PureTfidfIndex
│   ├── services/rag.py                  # Retriever TF-IDF + Cosine Similarity
│   ├── services/llm.py                  # Multi-provider BYOK adapter, retry, & redaction
│   ├── signals.py                       # Explicit cache invalidation pasca-mutasi FAQ
│   ├── static/spa/                      # Output build React (dibuat via npm run build)
│   ├── admin.py, apps.py, models.py, views.py, urls.py, tests.py
├── frontend/                # Aplikasi React 19 + TypeScript + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── api/chatApi.ts               # Klien fetch + CSRF + X-LLM-API-Key + dedup
│   │   ├── hooks/                       # useChatSession.ts, useFaqCatalog.ts
│   │   ├── components/                  # HeaderBar, FaqSidebar, ChatMessageBubble, ChatComposer,
│   │   │                                # ApiKeyModal, MarkdownContent, ErrorBoundary
│   │   ├── utils/providerDetect.ts      # Deteksi prefix API Key multi-provider
│   │   ├── types/chat.ts
│   │   └── App.tsx, App.css, main.tsx
│   ├── package.json, tsconfig.json, vite.config.ts
├── .env.example
├── .vercelignore
├── vercel.json              # Konfigurasi serverless @vercel/python
├── Makefile
├── manage.py
├── requirements.txt
└── README.md
```

## Sumber & Lisensi Dataset
- **Dataset**: `faq/data/faqs_prodi_ti.json` (18 entri FAQ mencakup Profil & Akreditasi Prodi TI PNM, Kurikulum & SIAKAD, Persiapan & Tata Tertib Lab, Penilaian & Troubleshooting Praktikum, Syarat/Alur/Durasi/Pembimbing/Luaran Magang PKL, Tugas Akhir, dan Layanan Konsultasi).
- **Sumber**: Kurasi mandiri mengacu pada panduan akademik, SOP praktikum laboratorium, RPS Sistem Cerdas, dan pedoman Magang/PKL Program Studi D-III Teknologi Informasi Politeknik Negeri Madiun.
- **Lisensi**: CC-BY-4.0 (bebas digunakan dan dimodifikasi untuk keperluan edukasi dengan mencantumkan atribusi).

## Cara Menjalankan (Lokal)
1. **Clone repositori dan salin `.env`:**
   ```bash
   git clone https://github.com/cpzz18/chatbot-faq-prodi-ti.git
   cd chatbot-faq-prodi-ti
   cp .env.example .env
   ```
   Sesuaikan konfigurasi database (`DATABASE_URL` atau `DB_ENGINE=sqlite`) pada file `.env`. API Key LLM dapat diisi langsung melalui tombol **API Key** di antarmuka web (BYOK).

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

## Deploy ke Vercel + Neon PostgreSQL
1. Buat database PostgreSQL gratis di [Neon.tech](https://neon.tech) dan salin *Connection String* (`postgresql://...`).
2. Jalankan migrasi & seed awal dari terminal lokal ke Neon:
   ```bash
   DATABASE_URL="<URL_NEON_ANDA>" python manage.py migrate
   DATABASE_URL="<URL_NEON_ANDA>" python manage.py seed_faqs
   ```
3. Import repositori di [Vercel](https://vercel.com), lalu set *Environment Variables*:
   - `DATABASE_URL` = `<URL_NEON_ANDA>`
   - `DJANGO_DEBUG` = `false`
   - `DJANGO_SECRET_KEY` = `<random-secret-key>`
4. Deploy — `vercel.json` dan `WhiteNoise` akan menyajikan Django API sekaligus static SPA React dari `faq/static/spa/`.

## Pengujian Otomatis
```bash
# Frontend typecheck & production bundle
cd frontend && npx tsc --noEmit && npm run build && cd ..

# Django system check & test suite (27 tests)
python manage.py check
DB_ENGINE=sqlite python manage.py test --verbosity=2
```

## Identitas Pengembang (Tugas Mandiri)
- **Nama / NIM:** Robbin Chandra Falla A (`253307059`)
- **Program Studi:** D-III Teknologi Informasi — Politeknik Negeri Madiun
- **Cakupan:** Arsitektur Django 5 + PostgreSQL (Neon)/SQLite, Pure-Python TF-IDF RAG (`PureTfidfIndex`), Cache-Aside & Signals Invalidation, Multi-Provider BYOK LLM, Kurasi 18 Dataset FAQ, Deploy Vercel Serverless, serta Frontend React 19 + Tailwind CSS v4.
