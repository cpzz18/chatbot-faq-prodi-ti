import json
from pathlib import Path

from django.core.management.base import BaseCommand

from faq.models import FAQ


class Command(BaseCommand):
    help = "Memuat dataset awal FAQ Prodi TI, Praktikum, dan Magang secara idempoten."

    def handle(self, *args, **options):
        data_path = Path(__file__).resolve().parents[2] / "data" / "faqs_prodi_ti.json"
        entries = json.loads(data_path.read_text(encoding="utf-8"))

        created_count = 0
        updated_count = 0

        for entry in entries:
            _, created = FAQ.objects.update_or_create(
                question=entry["question"],
                defaults={
                    "category": entry["category"],
                    "keywords": entry.get("keywords", ""),
                    "answer": entry["answer"],
                    "source": entry.get("source", "Panduan Prodi TI PNM"),
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        total = FAQ.objects.filter(is_active=True).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Seed FAQ selesai: {created_count} dibuat, {updated_count} diperbarui (total aktif: {total})."
            )
        )
