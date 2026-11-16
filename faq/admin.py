from django.contrib import admin

from .models import FAQ


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ("question", "category", "source", "is_active", "updated_at")
    list_filter = ("category", "is_active")
    search_fields = ("question", "keywords", "answer", "source")
    list_editable = ("is_active",)
    ordering = ("category", "id")
