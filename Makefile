CONDA_PYTHON := /home/chand/miniconda3/envs/sistem-cerdas/bin/python
PYTHON ?= $(shell if [ -x "$(CONDA_PYTHON)" ]; then echo "$(CONDA_PYTHON)"; else command -v python3 || command -v python; fi)
HOST ?= 127.0.0.1
PORT ?= 8000

.DEFAULT_GOAL := help
.PHONY: help install fe-install fe-check fe-build fe-dev makemigrations migrate seed setup run test check superuser shell clean

help:
	@echo "Target tersedia (mini_proyek_faq):"
	@echo "  make setup          - Instal dep BE+FE, build React, migrate DB, dan seed FAQ"
	@echo "  make run            - Jalankan Django dev server ($(HOST):$(PORT)) melayani React build"
	@echo "  make fe-dev         - Jalankan Vite dev server (:5173) dengan proxy ke Django (:8000)"
	@echo "  make fe-build       - Build React + TypeScript ke faq/static/spa/"
	@echo "  make fe-check       - Jalankan TypeScript typecheck (tsc --noEmit)"
	@echo "  make fe-install     - Instal dependensi npm React frontend"
	@echo "  make test           - Jalankan Django unit & integration tests"
	@echo "  make migrate        - Terapkan migrasi database"
	@echo "  make makemigrations - Buat file migrasi baru"
	@echo "  make seed           - Muat/perbarui dataset FAQ ke SQLite"
	@echo "  make check          - Jalankan Django system check"
	@echo "  make superuser      - Buat akun admin Django"
	@echo "  make shell          - Buka Django interactive shell"
	@echo "  make clean          - Hapus cache __pycache__, *.pyc, dan bundle SPA"

install:
	"$(PYTHON)" -m pip install -r requirements.txt

fe-install:
	cd frontend && npm install

fe-check:
	cd frontend && npm run typecheck

fe-build:
	cd frontend && npm run build

fe-dev:
	cd frontend && npm run dev

makemigrations:
	"$(PYTHON)" manage.py makemigrations

migrate:
	"$(PYTHON)" manage.py migrate

seed:
	"$(PYTHON)" manage.py seed_faqs

setup: install fe-install fe-build migrate seed

run:
	"$(PYTHON)" manage.py runserver $(HOST):$(PORT)

test:
	"$(PYTHON)" manage.py test -v 2

check:
	"$(PYTHON)" manage.py check

superuser:
	"$(PYTHON)" manage.py createsuperuser

shell:
	"$(PYTHON)" manage.py shell

clean:
	find . -maxdepth 4 -type d -name "__pycache__" -prune -exec rm -rf {} +
	find . -maxdepth 4 -type f -name "*.pyc" -delete
	rm -rf faq/static/spa
