from django.db import models


class FAQ(models.Model):
    """Entri basis pengetahuan FAQ Prodi TI, Praktikum, dan Magang."""

    CATEGORY_CHOICES = [
        ("prodi", "Profil & Akademik Prodi TI"),
        ("praktikum", "Praktikum & Laboratorium"),
        ("magang", "Magang / PKL"),
        ("layanan", "Layanan & Tugas Akhir"),
    ]

    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="prodi")
    question = models.CharField(max_length=255, unique=True)
    keywords = models.CharField(
        max_length=255,
        blank=True,
        help_text="Kata kunci atau sinonim pemisah koma untuk membantu pencocokan TF-IDF.",
    )
    answer = models.TextField()
    source = models.CharField(max_length=120, default="Panduan Prodi TI PNM")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "id"]
        verbose_name = "Entri FAQ"
        verbose_name_plural = "Daftar FAQ"

    def __str__(self) -> str:
        return f"[{self.get_category_display()}] {self.question}"
