from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from faq.models import FAQ
from faq.services.cache import invalidate_faq_cache


@receiver([post_save, post_delete], sender=FAQ)
def on_faq_mutated(sender, **kwargs):
    """Invalidate cache segera dan pasca-commit saat entri FAQ ditambah/diubah/dihapus."""
    invalidate_faq_cache()
    transaction.on_commit(invalidate_faq_cache)
