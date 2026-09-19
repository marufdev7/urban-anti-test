from __future__ import annotations

from typing import Any

from rest_framework import serializers

from urbenmend.api.serializers import CamelCaseSerializer, reject_unknown_fields
from urbenmend.audit.models import AuditEvent


class AuditEventSerializer(CamelCaseSerializer):
    id = serializers.UUIDField(read_only=True)
    actor_id = serializers.UUIDField(read_only=True)
    actor_email = serializers.EmailField(source="actor.email", read_only=True, allow_null=True)
    actor_role = serializers.CharField(source="actor.role", read_only=True)
    actor_name = serializers.SerializerMethodField()
    action = serializers.CharField(read_only=True)
    target_type = serializers.CharField(source="target_content_type.model", read_only=True)
    target_id = serializers.CharField(source="target_object_id", read_only=True)
    before = serializers.JSONField(read_only=True, allow_null=True)
    after = serializers.JSONField(read_only=True, allow_null=True)
    metadata = serializers.JSONField(read_only=True, default=dict)
    at = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "actor_id",
            "actor_email",
            "actor_role",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "before",
            "after",
            "metadata",
            "at",
        )

    def get_actor_name(self, obj: AuditEvent) -> str:
        if not obj.actor:
            return "Automated System"
        email = obj.actor.email or ""
        prefix = email.split("@")[0].lower() if email else ""
        if obj.actor.role == "admin":
            return "Municipal Administrator"
        elif "pierson" in prefix or "disp" in prefix:
            return "Dispatcher Pierson"
        elif "lead" in prefix:
            return "Lead Inspector Tariq"
        elif "grid" in prefix:
            return "Electrical Inspector"
        elif "field" in prefix:
            return "Field Liaison Officer"
        elif "road" in prefix:
            return "Roads & Transit Officer"
        elif "traffic" in prefix:
            return "Traffic Specialist"
        elif "health" in prefix or "sanitation" in prefix:
            return "Public Health Officer"
        elif prefix:
            parts = prefix.replace(".", " ").replace("_", " ").split()
            return " ".join(p.capitalize() for p in parts)
        return f"{obj.actor.role.capitalize()} User"


class AuditEventQuerySerializer(CamelCaseSerializer):
    actor_id = serializers.UUIDField(required=False)
    action = serializers.CharField(required=False)
    target_type = serializers.CharField(required=False)
    target_id = serializers.CharField(required=False)
    from_date = serializers.DateTimeField(required=False)
    to_date = serializers.DateTimeField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        reject_unknown_fields(self, extra_allowed=("limit", "cursor"))
        if (
            attrs.get("from_date")
            and attrs.get("to_date")
            and attrs["from_date"] > attrs["to_date"]
        ):
            raise serializers.ValidationError({"from": "Must be before or equal to `to`."})
        return attrs
