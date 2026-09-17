"""The canonical data model. FROZEN — everything downstream depends on these names.

Every dataset becomes this shape. The pipeline knows nothing else.
New signals arrive as optional fields; never add a required one.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

# Canonical field names. Mapping targets these strings exactly.
TIMESTAMP = "timestamp"
SERIES_ID = "series_id"
TARGET = "target"
ITEM_ID = "item_id"
LOCATION_ID = "location_id"
INVENTORY = "inventory"
PRICE = "price"
PROMO = "promo"
CATEGORY = "category"
LEAD_TIME = "lead_time"
MOQ = "moq"

REQUIRED_FIELDS = (TIMESTAMP, TARGET)
IDENTITY_FIELDS = (ITEM_ID, LOCATION_ID)
OPTIONAL_FIELDS = (
    ITEM_ID,
    LOCATION_ID,
    INVENTORY,
    PRICE,
    PROMO,
    CATEGORY,
    LEAD_TIME,
    MOQ,
)
ALL_FIELDS = REQUIRED_FIELDS + OPTIONAL_FIELDS

SERIES_SEP = "__"


def build_series_id(item_id: str | None, location_id: str | None) -> str:
    """item + location when both exist, item alone otherwise.

    FROZEN: changing this invalidates every stored forecast and recommendation.
    """
    item = (item_id or "").strip()
    location = (location_id or "").strip()
    if item and location:
        return f"{item}{SERIES_SEP}{location}"
    return item or location or "ALL"


def split_series_id(series_id: str) -> tuple[str, str | None]:
    if SERIES_SEP in series_id:
        item, location = series_id.split(SERIES_SEP, 1)
        return item, location
    return series_id, None


class Frequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"

    @property
    def days(self) -> int:
        return {"daily": 1, "weekly": 7, "monthly": 30}[self.value]

    @property
    def polars_every(self) -> str:
        return {"daily": "1d", "weekly": "1w", "monthly": "1mo"}[self.value]

    @property
    def seasonal_period(self) -> int:
        """Cycle length used by seasonal naive and MASE."""
        return {"daily": 7, "weekly": 52, "monthly": 12}[self.value]


class DemandClass(str, Enum):
    SMOOTH = "smooth"
    ERRATIC = "erratic"
    INTERMITTENT = "intermittent"
    LUMPY = "lumpy"


class DecisionMode(str, Enum):
    RITEL = "ritel"
    MANUFAKTUR = "manufaktur"


class FieldMapping(BaseModel):
    """One canonical field and the source column we believe fills it."""

    canonical: str
    source_column: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    reason: str = ""

    @property
    def needs_review(self) -> bool:
        return self.source_column is not None and self.confidence < 0.80


class SchemaMapping(BaseModel):
    fields: list[FieldMapping]
    preset_matched: str | None = None
    confirmed: bool = False

    def get(self, canonical: str) -> str | None:
        for field in self.fields:
            if field.canonical == canonical and field.source_column:
                return field.source_column
        return None

    def as_dict(self) -> dict[str, str]:
        return {
            f.canonical: f.source_column for f in self.fields if f.source_column
        }

    def missing_required(self) -> list[str]:
        return [f for f in REQUIRED_FIELDS if not self.get(f)]


class BusinessParams(BaseModel):
    """Never invented. Supplied per category with bulk apply, overridable per SKU."""

    lead_time_days: int = 14
    moq: float = 0.0
    service_level: float = 0.95
    unit_cost: float = 0.0
    unit_margin: float = 0.0
    holding_cost_rate: float = 0.02
    bom_factor: float = 1.0


class SeriesProfile(BaseModel):
    series_id: str
    n_obs: int
    n_nonzero: int
    adi: float
    cv2: float
    demand_class: DemandClass
    censored_periods: int = 0
    forecastable: bool = True
    exclusion_reason: str | None = None
