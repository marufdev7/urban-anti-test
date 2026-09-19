"""Small operational metrics that are not provided by django-prometheus."""

from __future__ import annotations

from contextlib import suppress

from django.conf import settings
from django.core.cache import cache
from prometheus_client import REGISTRY
from prometheus_client.core import GaugeMetricFamily


class UrbanMendCollector:
    """Expose bounded operational gauges from the existing DB/Redis state."""

    def describe(self):  # type: ignore[no-untyped-def]
        return []

    def collect(self):  # type: ignore[no-untyped-def]
        try:
            from urbenmend.notifications.selectors import outbox_backlog
            from urbenmend.reporting.models import ClassificationSource, Report

            count, age = outbox_backlog()
            yield GaugeMetricFamily(
                "urbenmend_outbox_pending",
                "Pending transactional outbox events.",
                value=count,
            )
            yield GaugeMetricFamily(
                "urbenmend_outbox_oldest_age_seconds",
                "Age of the oldest pending outbox event.",
                value=0 if age is None else age.total_seconds(),
            )
            classified = Report.objects.exclude(classified_at__isnull=True).count()
            fallback = Report.objects.filter(
                classification_source=ClassificationSource.FALLBACK
            ).count()
            yield GaugeMetricFamily(
                "urbenmend_classification_fallback_rate",
                "Fraction of classified reports using the keyword fallback.",
                value=0 if classified == 0 else fallback / classified,
            )
        except Exception:
            return

        try:
            day = __import__("django.utils.timezone", fromlist=["now"]).now().date().isoformat()
            used = cache.get(f"urbanmend:classification:budget:{day}") or 0
            budget = max(0, int(settings.CLASSIFICATION_LLM_DAILY_TOKEN_BUDGET))
            yield GaugeMetricFamily(
                "urbenmend_llm_daily_tokens_used",
                "Estimated LLM tokens reserved today.",
                value=int(used),
            )
            yield GaugeMetricFamily(
                "urbenmend_llm_daily_budget_ratio",
                "Fraction of the configured daily LLM token budget reserved today.",
                value=0 if budget == 0 else min(1.0, int(used) / budget),
            )
            client = cache.client.get_client()
            queue_depth = int(client.llen("celery"))
            yield GaugeMetricFamily(
                "urbenmend_celery_queue_depth",
                "Tasks waiting on the default Celery Redis queue.",
                value=queue_depth,
            )
        except Exception:
            return


with suppress(ValueError):
    REGISTRY.register(UrbanMendCollector())
