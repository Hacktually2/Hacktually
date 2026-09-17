"""Business parameters — the numbers the decision engine is not allowed to invent.

Lead time, MOQ, service level and cost do not live in a sales export. They live
in someone's head, in a supplier agreement, or in a different system entirely.
The architecture says never fabricate them, and this module is what makes that
true rather than aspirational.

Resolution is most-specific-first:

    series  ->  category  ->  dataset default  ->  built-in default

Category scope is the part that matters operationally. A mid-market ops lead
will happily tell you "imported goods take three weeks, local takes five days".
They will not fill in 428 rows, and a product that asks them to is a product
they abandon during the trial.

Anything still unset is reported as an assumption rather than silently used, so
a recommendation always carries the provenance of the numbers behind it.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..canonical import BusinessParams
from ..db import database as db

FIELDS = (
    "lead_time_days",
    "moq",
    "service_level",
    "unit_cost",
    "unit_margin",
    "holding_cost_rate",
    "bom_factor",
)

SCOPES = ("default", "category", "series")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def set_params(
    dataset_id: str, scope: str, scope_value: str, values: dict
) -> dict:
    """Upsert one scope. Only the fields provided are written; the rest inherit."""
    if scope not in SCOPES:
        raise ValueError(f"scope must be one of {', '.join(SCOPES)}")
    if scope != "default" and not scope_value:
        raise ValueError(f"scope '{scope}' needs a scope_value")

    clean = {k: v for k, v in values.items() if k in FIELDS and v is not None}
    if not clean:
        raise ValueError(f"nothing to set — expected any of: {', '.join(FIELDS)}")

    existing = db.query_one(
        "SELECT * FROM business_params WHERE dataset_id=? AND scope=? AND scope_value=?",
        (dataset_id, scope, scope_value or ""),
    )
    merged = {f: (existing[f] if existing else None) for f in FIELDS}
    merged.update(clean)

    db.execute(
        f"""INSERT OR REPLACE INTO business_params
            (dataset_id, scope, scope_value, {", ".join(FIELDS)}, updated_at)
            VALUES (?,?,?,{",".join("?" * len(FIELDS))},?)""",
        (
            dataset_id,
            scope,
            scope_value or "",
            *[merged[f] for f in FIELDS],
            _now(),
        ),
    )
    return {"scope": scope, "scope_value": scope_value, "set": clean}


def set_many(dataset_id: str, entries: list[dict]) -> dict:
    """Bulk apply — one call sets every category at once."""
    written = []
    for entry in entries:
        written.append(
            set_params(
                dataset_id,
                entry.get("scope", "category"),
                entry.get("scope_value", ""),
                entry.get("values", entry),
            )
        )
    return {"written": len(written), "entries": written}


def _row_to_dict(row) -> dict:
    return {f: row[f] for f in FIELDS if row[f] is not None} if row else {}


def load_all(dataset_id: str) -> dict:
    """Everything set for this dataset, keyed by scope."""
    rows = db.query(
        "SELECT * FROM business_params WHERE dataset_id = ? ORDER BY scope, scope_value",
        (dataset_id,),
    )
    out: dict[str, dict] = {"default": {}, "category": {}, "series": {}}
    for row in rows:
        values = _row_to_dict(row)
        if row["scope"] == "default":
            out["default"] = values
        else:
            out[row["scope"]][row["scope_value"]] = values
    return out


def resolve(
    dataset_id: str,
    series_id: str | None = None,
    category: str | None = None,
    cached: dict | None = None,
) -> tuple[BusinessParams, list[str]]:
    """Return (params, assumed_fields).

    assumed_fields lists everything that fell through to a built-in default, so
    the UI can mark it and the pitch can be honest about it.
    """
    store = cached if cached is not None else load_all(dataset_id)

    layered: dict = {}
    layered.update(store.get("default", {}))
    if category:
        layered.update(store.get("category", {}).get(category, {}))
    if series_id:
        layered.update(store.get("series", {}).get(series_id, {}))

    builtin = BusinessParams()
    assumed = [f for f in FIELDS if f not in layered]

    values = {f: layered.get(f, getattr(builtin, f)) for f in FIELDS}
    if values["lead_time_days"] is not None:
        values["lead_time_days"] = int(values["lead_time_days"])

    return BusinessParams(**values), assumed


def suggest(dataset_id: str) -> dict:
    """What we can propose from the data itself, and what we genuinely cannot.

    Price is in the export, so unit cost can be estimated. Lead time, MOQ and
    service level are commercial facts that no sales history contains — those
    are asked for, never guessed.
    """
    rows = db.query(
        """SELECT category, COUNT(*) AS series, AVG(avg_demand) AS avg_demand
           FROM series_profiles
           WHERE dataset_id = ? AND forecastable = 1
           GROUP BY category ORDER BY series DESC""",
        (dataset_id,),
    )

    prices = db.query_one(
        "SELECT health_report FROM datasets WHERE dataset_id = ?", (dataset_id,)
    )

    categories = []
    for row in rows:
        categories.append(
            {
                "category": row["category"] or "(uncategorised)",
                "series": row["series"],
                "avg_daily_demand": round(row["avg_demand"] or 0, 1),
                # Deliberately empty. These are the questions to ask, not fill.
                "lead_time_days": None,
                "moq": None,
            }
        )

    return {
        "dataset_id": dataset_id,
        "categories": categories,
        "must_be_provided": ["lead_time_days", "moq", "service_level"],
        "can_be_estimated": ["unit_cost", "unit_margin"],
        "note": (
            "Lead time, MOQ and service level are commercial terms — they are not "
            "in a sales export and we do not guess them. Set them per category; "
            "per-SKU overrides only where a supplier differs."
        ),
    }
