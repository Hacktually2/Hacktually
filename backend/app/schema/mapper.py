"""Three-tier mapping: presets, then rules, then (optionally) an LLM.

Each tier only handles what the tier above could not. Tier 3 is enrichment,
never a dependency — if the network dies mid-demo, tiers 1 and 2 still map.
"""

from __future__ import annotations

from ..canonical import (
    ALL_FIELDS,
    CATEGORY,
    FieldMapping,
    INVENTORY,
    ITEM_ID,
    LEAD_TIME,
    LOCATION_ID,
    MOQ,
    PRICE,
    PROMO,
    SchemaMapping,
    TARGET,
    TIMESTAMP,
)
from .presets import match_preset, normalize
from .profiler import ColumnProfile

# Name fragments that suggest a canonical role. Indonesian and English.
SYNONYMS: dict[str, tuple[str, ...]] = {
    TIMESTAMP: (
        "tanggal", "tgl", "date", "datetime", "waktu", "periode", "period",
        "orderdate", "transactiondate", "invoicedate", "productiondate",
    ),
    TARGET: (
        "qty", "quantity", "kuantitas", "jumlah", "demand", "sales", "sold",
        "terjual", "unitssold", "qtyout", "quantityout", "units", "penjualan",
        "movement", "keluar",
    ),
    ITEM_ID: (
        "sku", "item", "product", "barang", "kodebrg", "kodebarang", "itemcode",
        "productcode", "itemno", "nobarang", "kodeproduk", "partnumber",
    ),
    LOCATION_ID: (
        "location", "lokasi", "branch", "cabang", "warehouse", "gudang",
        "store", "toko", "outlet", "dc", "depot", "site",
    ),
    INVENTORY: (
        "inventory", "stock", "stok", "onhand", "stockonhand", "saldo",
        "availableqty", "sisastok",
    ),
    PRICE: ("price", "harga", "unitprice", "hargasatuan", "hargenet", "nilai"),
    PROMO: ("promo", "promotion", "discount", "disc", "diskon", "isdiscount"),
    CATEGORY: ("category", "kategori", "class", "kelas", "group", "grup", "jenis"),
    LEAD_TIME: ("leadtime", "waktutunggu"),
    MOQ: ("moq", "minorder", "minimumorder"),
}

# Roles a column must not take even if the name looks right.
NEGATIVE_HINTS: dict[str, tuple[str, ...]] = {
    TARGET: ("revenue", "omzet", "total", "amount", "nilai", "subtotal", "grandtotal"),
}


def _name_score(column: str, canonical: str) -> tuple[float, str]:
    """Score a column name against a canonical role."""
    norm = normalize(column)
    for bad in NEGATIVE_HINTS.get(canonical, ()):
        if bad in norm:
            return 0.0, f"'{column}' looks like a monetary total, not {canonical}"
    best = 0.0
    reason = ""
    for synonym in SYNONYMS.get(canonical, ()):
        if norm == synonym:
            return 0.95, f"'{column}' is a known name for {canonical}"
        if synonym in norm:
            score = 0.72 + 0.2 * (len(synonym) / max(len(norm), 1))
            if score > best:
                best = min(score, 0.92)
                reason = f"'{column}' contains '{synonym}'"
    return best, reason


def _structural_bonus(profile: ColumnProfile, canonical: str) -> tuple[float, str]:
    """Shape evidence, independent of the column's name."""
    if canonical == TIMESTAMP:
        if profile.is_datetime_like:
            bonus = 0.35 if profile.monotonic_ratio > 0.9 else 0.25
            return bonus, "parses as dates"
        return -0.6, "does not parse as dates"

    if canonical == TARGET:
        if not profile.is_numeric:
            return -0.7, "not numeric"
        bonus, reason = 0.15, "numeric"
        if profile.is_integral and not profile.has_negatives:
            bonus, reason = 0.25, "non-negative whole numbers, consistent with units"
        if profile.max_value and profile.max_value > 1_000_000:
            bonus -= 0.2
            reason = "values are large enough to look monetary"
        return bonus, reason

    if canonical in (ITEM_ID, LOCATION_ID, CATEGORY):
        if profile.is_datetime_like:
            return -0.5, "looks like a date"
        ratio = profile.unique_ratio
        if canonical == ITEM_ID and 0.0005 < ratio < 0.6:
            return 0.2, f"{profile.cardinality} distinct values, consistent with items"
        if canonical in (LOCATION_ID, CATEGORY) and profile.cardinality <= 60:
            return 0.2, f"only {profile.cardinality} distinct values"
        return -0.1, "cardinality does not fit"

    if canonical in (INVENTORY, PRICE, LEAD_TIME, MOQ):
        return (0.15, "numeric") if profile.is_numeric else (-0.6, "not numeric")

    if canonical == PROMO:
        if profile.cardinality <= 3:
            return 0.25, "binary-looking flag"
        return (0.05, "numeric") if profile.is_numeric else (-0.3, "not a flag")

    return 0.0, ""


def map_by_rules(profiles: list[ColumnProfile]) -> dict[str, FieldMapping]:
    """Tier 2. Greedy assignment, strongest evidence first, one column per role."""
    candidates: list[tuple[float, str, str, str]] = []
    for canonical in ALL_FIELDS:
        for profile in profiles:
            name_score, name_reason = _name_score(profile.name, canonical)
            bonus, shape_reason = _structural_bonus(profile, canonical)
            score = name_score + bonus
            if name_score == 0.0 and bonus <= 0:
                continue
            if score <= 0.25:
                continue
            reason = " · ".join(r for r in (name_reason, shape_reason) if r)
            candidates.append((min(score, 0.99), canonical, profile.name, reason))

    candidates.sort(reverse=True, key=lambda c: c[0])
    taken_columns: set[str] = set()
    result: dict[str, FieldMapping] = {}
    for score, canonical, column, reason in candidates:
        if canonical in result or column in taken_columns:
            continue
        result[canonical] = FieldMapping(
            canonical=canonical,
            source_column=column,
            confidence=round(score, 2),
            reason=reason,
        )
        taken_columns.add(column)
    return result


def build_mapping(
    headers: list[str],
    profiles: list[ColumnProfile],
    llm_hints: dict[str, str] | None = None,
) -> SchemaMapping:
    """Tier 1 preset, else tier 2 rules, with optional tier 3 hints filling gaps."""
    preset_hit = match_preset(headers)
    fields: dict[str, FieldMapping] = {}
    preset_name = None

    if preset_hit:
        preset, resolved = preset_hit
        preset_name = preset.name
        for canonical, column in resolved.items():
            fields[canonical] = FieldMapping(
                canonical=canonical,
                source_column=column,
                confidence=0.99,
                reason=f"matched {preset.vendor} export format",
            )

    for canonical, mapping in map_by_rules(profiles).items():
        fields.setdefault(canonical, mapping)

    if llm_hints:
        known = {p.name for p in profiles}
        used = {f.source_column for f in fields.values()}
        for canonical, column in llm_hints.items():
            if canonical in fields or column not in known or column in used:
                continue
            fields[canonical] = FieldMapping(
                canonical=canonical,
                source_column=column,
                confidence=0.70,
                reason="inferred from column semantics",
            )

    ordered = [
        fields.get(name, FieldMapping(canonical=name, reason="not detected"))
        for name in ALL_FIELDS
    ]
    return SchemaMapping(fields=ordered, preset_matched=preset_name)
