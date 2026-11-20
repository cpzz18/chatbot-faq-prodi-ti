from pathlib import Path
import os
import socket
from urllib.parse import parse_qs, unquote, urlparse
import warnings

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Muat .env lokal proyek jika ada
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-mini-proyek-faq-prodi-ti-key")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

_raw_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver,.vercel.app")
ALLOWED_HOSTS = [h.strip() for h in _raw_hosts.split(",") if h.strip()]

_raw_csrf = os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "https://*.vercel.app")
CSRF_TRUSTED_ORIGINS = [u.strip() for u in _raw_csrf.split(",") if u.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "faq",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

def _can_reach_postgres(host: str, port: str, timeout: float = 0.8) -> bool:
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except (OSError, ValueError):
        return False


_database_url = (os.getenv("DATABASE_URL") or "").strip()
DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()
_pg_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
_pg_port = os.getenv("POSTGRES_PORT", "5432")

if _database_url.startswith(("postgres://", "postgresql://")):
    _parsed = urlparse(_database_url)
    _query_params = parse_qs(_parsed.query)
    _db_options: dict[str, object] = {"connect_timeout": 5}
    if "sslmode" in _query_params and _query_params["sslmode"]:
        _db_options["sslmode"] = _query_params["sslmode"][0]
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _parsed.path.lstrip("/") or "postgres",
            "USER": unquote(_parsed.username or ""),
            "PASSWORD": unquote(_parsed.password or ""),
            "HOST": _parsed.hostname or "",
            "PORT": str(_parsed.port or 5432),
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": _db_options,
        }
    }
else:
    _use_postgres = DB_ENGINE in {"postgres", "postgresql"} and _can_reach_postgres(_pg_host, _pg_port)
    if DB_ENGINE in {"postgres", "postgresql"} and not _use_postgres:
        warnings.warn(
            f"PostgreSQL di {_pg_host}:{_pg_port} tidak terjangkau, beralih otomatis ke SQLite (db.sqlite3).",
            RuntimeWarning,
            stacklevel=2,
        )

    if _use_postgres:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": os.getenv("POSTGRES_DB", "chatbot_faq_ti"),
                "USER": os.getenv("POSTGRES_USER", "faq_user"),
                "PASSWORD": os.getenv("POSTGRES_PASSWORD", "faq_pass"),
                "HOST": _pg_host,
                "PORT": _pg_port,
                "CONN_MAX_AGE": 60,
                "CONN_HEALTH_CHECKS": True,
                "OPTIONS": {
                    "connect_timeout": 5,
                    "options": (
                        "-c statement_timeout=5000 "
                        "-c lock_timeout=3000 "
                        "-c idle_in_transaction_session_timeout=10000"
                    ),
                },
            }
        }
    else:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "faq-smart-cache",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "id"
TIME_ZONE = "Asia/Jakarta"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
WHITENOISE_USE_FINDERS = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# OWASP & Production Security Hardening (Agent_Memory 04 & 07)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

