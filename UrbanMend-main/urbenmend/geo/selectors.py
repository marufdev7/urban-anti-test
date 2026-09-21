"""
Geospatial — read operations (T2.1).

Query functions for this module. Kept separate from services.py so reads never acquire
write-path side effects, and so the modules that consume this one have a single documented
surface to call [doc: Arch §3.1].

Rules for this file:
  - No writes, no `transaction.atomic`, no task enqueue.
  - Apply the caller's visibility rules here — a selector that returns rows the actor may
    not see is an authorization bug even though it wrote nothing [doc: Arch §3.1, FR-3].
  - Return querysets or domain objects, never DRF serializers or HTTP responses.

⚠️ `CityBoundary` is public reference data (data-model §16 grants every role `R`), so nothing
here filters by actor. The `Report`-level visibility rules live in `reporting/selectors.py`.

[doc: Arch §3 (FR-6, FR-16, FR-17, FR-23, NFR-1) and §9; data-model §16; BR-35, C-11]
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.gis.db.models.functions import Distance as DistanceFunction
from django.contrib.gis.db.models.functions import GeometryDistance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import Distance

from urbenmend.geo.models import POI, CityBoundary

if TYPE_CHECKING:
    from django.db.models import QuerySet


class BoundaryUnavailable(RuntimeError):
    """No single active `CityBoundary` could be resolved.

    ⚠️ **Raised rather than returning `None`.** A `None` return invites
    `if boundary and not contains(...)`, which fails *open* — every out-of-city report is
    accepted the moment the table is empty, and BR-35 stops being enforced with nothing saying
    so. Arch §409 does sanction degrading gracefully when the boundary is missing ("skip the
    out-of-city check"), but that is a decision for a caller to take explicitly and visibly,
    not a default that arrives by way of a falsy value.
    """


def active_city_boundary() -> CityBoundary:
    """The single served-city boundary (data-model §16, ASSUMP-6).

    ⚠️ Raises `BoundaryUnavailable` unless exactly one active row exists. Two active boundaries
    is not a state to pick a winner from: they disagree about where the city ends, so row order
    would silently decide whether a report near the border is accepted.
    """
    boundaries = list(CityBoundary.objects.filter(is_active=True)[:2])
    if not boundaries:
        raise BoundaryUnavailable("No active city boundary is configured (BR-35, ASSUMP-6).")
    if len(boundaries) > 1:
        raise BoundaryUnavailable(
            "More than one active city boundary is configured; exactly one is expected."
        )
    return boundaries[0]


def is_within_city(point: Point) -> bool:
    """Whether `point` falls inside the served city or any supported City Corporation (BR-35, C-11).

    ⚠️ **The containment test runs in PostGIS first.** `area__contains` hands the
    predicate to the database, which can use the GiST index.
    If not in the primary boundary, supports municipal intake across all 10 Bangladesh
    City Corporations (Chattogram, Rajshahi, Khulna, Sylhet, Barishal, Rangpur,
    Mymensingh, Gazipur, Cumilla).
    """
    if CityBoundary.objects.filter(is_active=True, area__contains=point).exists():
        return True

    # Fails closed if no active boundary is configured
    if not CityBoundary.objects.filter(is_active=True).exists():
        return False

    AREA_ENVELOPES_LIST = [
        (22.15, 91.65, 22.55, 91.95),  # Chattogram (CCC)
        (24.28, 88.48, 24.48, 88.72),  # Rajshahi (RCC)
        (22.68, 89.45, 22.95, 89.65),  # Khulna (KCC)
        (24.78, 91.78, 25.02, 91.98),  # Sylhet (SCC)
        (22.62, 90.28, 22.80, 90.46),  # Barishal (BCC)
        (25.65, 89.15, 25.85, 89.35),  # Rangpur (RpCC)
        (24.68, 90.32, 24.85, 90.49),  # Mymensingh (MCC)
        (23.88, 90.30, 24.15, 90.52),  # Gazipur (GCC)
        (23.38, 91.10, 23.55, 91.26),  # Cumilla (CuCC)
    ]
    for min_lat, min_lng, max_lat, max_lng in AREA_ENVELOPES_LIST:
        if min_lat <= point.y <= max_lat and min_lng <= point.x <= max_lng:
            return True

    return False


AREA_ENVELOPES: dict[str, tuple[float, float, float, float]] = {
    # area_key: (min_lng, min_lat, max_lng, max_lat) in WGS84
    "dhaka": (90.32, 23.68, 90.52, 23.90),
    "dncc": (90.33, 23.765, 90.45, 23.90),
    "dscc": (90.355, 23.68, 90.445, 23.765),
    "chattogram": (91.65, 22.15, 91.95, 22.55),
    "rajshahi": (88.48, 24.28, 88.72, 24.48),
    "khulna": (89.45, 22.68, 89.65, 22.95),
    "sylhet": (91.78, 24.78, 91.98, 25.02),
    "barishal": (90.28, 22.62, 90.46, 22.80),
    "rangpur": (89.15, 25.65, 89.35, 25.85),
    "mymensingh": (90.32, 24.68, 90.49, 24.85),
    "gazipur": (90.30, 23.88, 90.52, 24.15),
    "cumilla": (91.10, 23.38, 91.26, 23.55),
}


def get_area_bbox_polygon(area_id: str | None):
    """Return a 4326 Polygon for the given area key, or None if unknown/unrestricted."""
    if not area_id:
        return None
    key = str(area_id).lower().strip()
    if key in AREA_ENVELOPES:
        from django.contrib.gis.geos import Polygon

        return Polygon.from_bbox(AREA_ENVELOPES[key])
    return None


def nearby_pois(*, point: Point, radius_m: float, limit: int = 5) -> QuerySet[POI]:
    """Active POIs near `point`, nearest first, for display-only Issue context.

    This selector must not feed severity, Issue ordering, clustering, or other business rules.
    `radius_m` and `limit` stay explicit at the call site so presentation choices cannot become
    hidden policy. The geography `ST_DWithin` predicate uses metres and the KNN ordering can use
    `geo_poi_location_gist`.

    ⚠️ **Two distance annotations, and they are not redundant.** `knn_distance` is PostGIS's `<->`
    operator, which is what the GiST index can answer an ordering with; its value is a planar
    approximation and must never be shown. `distance` is `ST_Distance`, the true geodesic metres
    §6.5 renders as `proximity[].distanceM` (T7.1). Ordering by `distance` instead would be *more*
    accurate and would abandon the index, turning a display-only garnish into a table scan.

    ⚠️ **`distance` is a `django.contrib.gis.measure.Distance` object, not a float.** GeoDjango's
    `DistanceField` wraps the result, so a serializer must read `.m` — using the value directly
    would render `{"distanceM": "120.0 m"}` or a repr, depending on the JSON encoder. The DB
    function is imported aliased because this module already imports the measure class under its
    real name.
    """
    if radius_m <= 0:
        raise ValueError("radius_m must be positive.")
    if limit <= 0:
        raise ValueError("limit must be positive.")

    return (
        POI.objects.filter(
            is_active=True,
            location__dwithin=(point, Distance(m=radius_m)),
        )
        .annotate(
            knn_distance=GeometryDistance("location", point),
            distance=DistanceFunction("location", point),
        )
        .order_by("knn_distance", "pk")[:limit]
    )


def list_pois(
    *,
    poi_type: str | None = None,
    bbox=None,
    near: Point | None = None,
    radius_m: float | None = None,
) -> QuerySet[POI]:
    queryset = POI.objects.all()
    if poi_type:
        queryset = queryset.filter(poi_type=poi_type)
    if bbox is not None:
        queryset = queryset.filter(location__bboverlaps=bbox)
    if near is not None and radius_m is not None:
        queryset = queryset.filter(location__dwithin=(near, Distance(m=radius_m)))
    return queryset
