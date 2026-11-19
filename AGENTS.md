# AGENTS.md — Chatbot FAQ Prodi TI PNM

> Universal AI agent instructions for `mini_proyek_faq` (Single Source of Truth for Antigravity, Claude Code, Cursor, and Codex). Keep under 100 lines; consult global Obsidian `Agent_Memory/01_Guides_EN/` for deep architectural guidelines.

## 1. Project Overview & Map
- **Purpose:** Academic & laboratory FAQ assistant for Prodi D-III Teknologi Informasi Politeknik Negeri Madiun (PNM) featuring TF-IDF RAG retrieval, multi-provider BYOK LLM integration, and hybrid React SPA.
- **Stack:** Python 3.12 + Django 5 + PostgreSQL (with SQLite fallback) + LocMemCache + React 18 + TypeScript + Vite.
- **Directory Layout:**
  - `config/` — Django settings, security middleware, ASGI/WSGI, root URL routing.
  - `faq/` — Core Django app: `models.py`, `views.py`, `urls.py`, `admin.py`, `tests.py`.
  - `faq/services/` — RAG pipeline (`rag.py`), Cache-Aside & TF-IDF memory cache (`cache.py`), Multi-Provider LLM adapters & secret redacting (`llm.py`).
  - `frontend/` — React SPA (`src/components/`, `src/hooks/`, `src/api/`, `src/types/`).
  - `data/` — Static seed knowledge base (`faqs_prodi_ti.json`).

## 2. Commands (Run & Verify)
```bash
# Backend checks & tests (PostgreSQL + SQLite fallback)
python manage.py check
python manage.py test --verbosity=2
DB_ENGINE=sqlite python manage.py test --verbosity=2

# Frontend verification & production bundle
cd frontend && npx tsc --noEmit && npm run build && cd ..

# Knowledge base re-indexing
python manage.py seed_faqs --clear
```

## 3. Repository Boundaries & Invariants
- **BYOK & Ephemeral Key Transit:** Client API keys (`gemini`, `openai`, `groq`, `anthropic`, `openrouter`, `deepseek`) transit strictly via ephemeral `X-LLM-API-Key` headers. NEVER persist keys in DB, session, or cache. Log outputs must redact keys with `[REDACTED_KEY]`.
- **Cache-Aside & TTL Jitter:** Invalidate cache via `invalidate_faq_cache()` on any FAQ mutation. Apply `_with_ttl_jitter(base_ttl, 0.15)` to avoid thundering herd.
- **HTTP Caching & Headers:** `GET /api/faqs/` returns versioned `ETag` + `304 Not Modified` with `Cache-Control: public, max-age=30, stale-while-revalidate=60`. Chat & session endpoints must enforce `Cache-Control: private, no-store`.
- **Probes & Observability:** `/healthz` provides lightweight process liveness (no DB touch). `/readyz` probes active DB query (`SELECT 1`) + cache readback. All API responses propagate `X-Request-ID`.
- **Resilience & Rate Limiting:** `_request_json()` retries only transient errors (`502/503/504`/timeout) with exponential backoff + jitter; never retry 4xx errors. `POST /api/chat/` enforces a 30 req/min/IP cache-backed rate limit (`429 RATE_LIMIT_EXCEEDED`).
- **Standard Envelope:** API errors map to `{status: "error", error_code: "...", message: "...", request_id: "..."}` while maintaining backward-compatible `error` field.

## 4. Git & PR Workflow
- Atomic staging per feature (`git add <feature-files>` + separate `git commit`, never blind `git add .`).
- Clear English Conventional Commits (`<type>(<scope>): <clear summary>`).
- Always run `git pull --rebase origin dev` before pushing strictly to `origin dev` (never push directly to `main`).
