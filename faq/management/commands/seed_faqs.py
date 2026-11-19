import json
import logging
import urllib.error
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand

from faq.models import FAQ
from faq.services.cache import invalidate_faq_cache

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Memuat dataset resmi FAQ Prodi TI, Praktikum, dan Magang secara idempoten."

    def add_arguments(self, parser):
        parser.add_argument(
            "--fetch-web",
            action="store_true",
            help="Verifikasi konektivitas langsung ke https://ti.pnm.ac.id sebelum memuat dataset.",
        )
        parser.add_argument(
            "--prune",
            action="store_true",
            default=True,
            help="Hapus entri lama yang tidak ada dalam daftar pertanyaan faqs_prodi_ti.json.",
        )

    def handle(self, *args, **options):
        if options.get("fetch_web"):
            self.stdout.write("Memeriksa website resmi https://ti.pnm.ac.id ...")
            try:
                req = urllib.request.Request(
                    "https://ti.pnm.ac.id",
                    headers={"User-Agent": "Mozilla/5.0 (compatible; ChatbotFAQTI/1.0)"},
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    status = resp.status
                    self.stdout.write(
                        self.style.SUCCESS(f"Terhubung ke https://ti.pnm.ac.id (HTTP {status}).")
                    )
            except Exception as exc:
                self.stdout.write(
                    self.style.WARNING(f"Gagal menghubungi https://ti.pnm.ac.id: {exc}. Menggunakan basis data terverifikasi lokal.")
                )

        data_path = Path(__file__).resolve().parents[2] / "data" / "faqs_prodi_ti.json"
        entries = json.loads(data_path.read_text(encoding="utf-8"))

        current_questions = {entry["question"] for entry in entries}

        if options.get("prune", True):
            # Nonaktifkan entri yang tidak ada dalam dataset resmi terbaru
            orphans = FAQ.objects.exclude(question__in=current_questions)
            if orphans.exists():
                orphan_count = orphans.count()
                orphans.delete()
                self.stdout.write(f"Membersihkan {orphan_count} entri FAQ lama yang sudah diperbarui.")

        created_count = 0
        updated_count = 0

        for entry in entries:
            _, created = FAQ.objects.update_or_create(
                question=entry["question"],
                defaults={
                    "category": entry["category"],
                    "keywords": entry.get("keywords", ""),
                    "answer": entry["answer"],
                    "source": entry.get("source", "Website Resmi Prodi TI PNM (ti.pnm.ac.id)"),
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        invalidate_faq_cache()
        total = FAQ.objects.filter(is_active=True).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Seed FAQ selesai: {created_count} dibuat, {updated_count} diperbarui (total aktif: {total})."
            )
        )
