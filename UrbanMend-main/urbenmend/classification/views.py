from typing import cast

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import ValidationError
from rest_framework.views import APIView

from urbenmend.api.pagination import StandardCursorPagination
from urbenmend.classification.models import Category
from urbenmend.classification.contracts import ClassificationRequest
from urbenmend.classification.reference_services import (
    create_category,
    create_severity_keyword,
    update_category,
    update_severity_keyword,
)
from urbenmend.classification.selectors import active_category_slugs, list_severity_keywords
from urbenmend.classification.serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CategoryUpdateSerializer,
    SeverityKeywordSerializer,
    SeverityKeywordWriteSerializer,
)
from urbenmend.classification.services import classify_with_fallback
from urbenmend.identity.models import User


class CategoryCollectionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        return Response(CategorySerializer(Category.objects.all(), many=True).data)

    def post(self, request: Request) -> Response:
        serializer = CategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = create_category(actor=cast("User", request.user), **serializer.validated_data)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    permission_classes = [AllowAny]

    def patch(self, request: Request, key: str) -> Response:
        serializer = CategoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = update_category(
            actor=cast("User", request.user),
            key=key,
            label=serializer.validated_data.get("label"),
            active=serializer.validated_data.get("active"),
        )
        return Response(CategorySerializer(category).data)


class SeverityKeywordCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        queryset = list_severity_keywords(actor=cast("User", request.user))
        paginator = StandardCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self) or []
        return paginator.get_paginated_response(SeverityKeywordSerializer(page, many=True).data)

    def post(self, request: Request) -> Response:
        serializer = SeverityKeywordWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        required = {"term", "language", "severity"}
        missing = required - serializer.validated_data.keys()
        if missing:
            raise ValidationError(dict.fromkeys(missing, "This field is required."))
        keyword = create_severity_keyword(
            actor=cast("User", request.user), **serializer.validated_data
        )
        return Response(SeverityKeywordSerializer(keyword).data, status=status.HTTP_201_CREATED)


class SeverityKeywordDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, keyword_id: int) -> Response:
        serializer = SeverityKeywordWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        keyword = update_severity_keyword(
            actor=cast("User", request.user), keyword_id=keyword_id, **serializer.validated_data
        )
        return Response(SeverityKeywordSerializer(keyword).data)

    def delete(self, request: Request, keyword_id: int) -> Response:
        keyword = update_severity_keyword(
            actor=cast("User", request.user), keyword_id=keyword_id, active=False
        )
        return Response(SeverityKeywordSerializer(keyword).data)


class ClassifyPreviewView(APIView):
    """Real-time AI/fallback classification preview for report drafting (FR-13a)."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        text = str(request.data.get("text") or "").strip()
        if not text:
            return Response({"error": "text is required"}, status=status.HTTP_400_BAD_REQUEST)

        has_bangla = any("\u0980" <= c <= "\u09ff" for c in text)
        classification_req = ClassificationRequest(
            text=text,
            allowed_categories=active_category_slugs(),
            language="bn" if has_bangla else "en",
        )
        user_scope = str(request.user.id) if request.user and request.user.is_authenticated else "anon"
        result = classify_with_fallback(classification_req, user_scope=user_scope)
        return Response(
            {
                "category": result.category,
                "severity": result.severity.value,
                "confidence": result.confidence,
                "rationale": result.rationale,
                "source": result.source.value,
                "model": result.model,
            }
        )

