"""T10.6 custom operational metric coverage."""

import pytest
from django.test import Client

pytestmark = pytest.mark.django_db


def test_metrics_endpoint_exposes_urbanmend_operational_gauges() -> None:
    response = Client().get("/metrics")

    assert response.status_code == 200
    body = response.content.decode()
    for metric in (
        "urbenmend_outbox_pending",
        "urbenmend_outbox_oldest_age_seconds",
        "urbenmend_llm_daily_tokens_used",
        "urbenmend_llm_daily_budget_ratio",
        "urbenmend_celery_queue_depth",
        "urbenmend_classification_fallback_rate",
    ):
        assert metric in body
