from django.apps import AppConfig


class FaqConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "faq"
    verbose_name = "Chatbot FAQ Prodi TI"

    def ready(self) -> None:
        from faq import signals  # noqa: F401
