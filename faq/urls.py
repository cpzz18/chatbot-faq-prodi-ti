from django.urls import path

from . import views

app_name = "faq"

urlpatterns = [
    path("", views.chat_page, name="chat_page"),
    path("healthz", views.healthz_probe, name="healthz_bare"),
    path("healthz/", views.healthz_probe, name="healthz"),
    path("readyz", views.readyz_probe, name="readyz_bare"),
    path("readyz/", views.readyz_probe, name="readyz"),
    path("api/chat/state/", views.chat_state_api, name="chat_state_api"),
    path("api/chat/", views.chat_api, name="chat_api"),
    path("api/chat/reset/", views.reset_chat_api, name="reset_chat_api"),
    path("api/faqs/", views.faq_list_api, name="faq_list_api"),
]
