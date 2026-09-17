"""Tier 1 mapping: known ERP/POS export fingerprints.

Mid-market Indonesia runs a handful of systems, not a thousand. Matching a
known export is instant, needs no network, cannot fail on stage, and reads as
market knowledge rather than a model call.

A preset matches when every column in `required_headers` is present (compared
case-insensitively, ignoring spaces and underscores).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..canonical import (
    CATEGORY,
    INVENTORY,
    ITEM_ID,
    LOCATION_ID,
    PRICE,
    PROMO,
    TARGET,
    TIMESTAMP,
)


def normalize(header: str) -> str:
    return "".join(ch for ch in header.lower() if ch.isalnum())


@dataclass(frozen=True)
class Preset:
    name: str
    vendor: str
    required_headers: tuple[str, ...]
    mapping: dict[str, str]
    notes: str = ""
    optional_mapping: dict[str, str] = field(default_factory=dict)

    def matches(self, headers: list[str]) -> bool:
        present = {normalize(h) for h in headers}
        return all(normalize(h) in present for h in self.required_headers)

    def resolve(self, headers: list[str]) -> dict[str, str]:
        """Return canonical -> actual column name, using the file's real spelling."""
        by_norm = {normalize(h): h for h in headers}
        resolved: dict[str, str] = {}
        for canonical, source in {**self.mapping, **self.optional_mapping}.items():
            actual = by_norm.get(normalize(source))
            if actual:
                resolved[canonical] = actual
        return resolved


PRESETS: tuple[Preset, ...] = (
    Preset(
        name="Accurate Online — Sales by Item",
        vendor="Accurate",
        required_headers=("Tanggal", "No Barang", "Kuantitas"),
        mapping={
            TIMESTAMP: "Tanggal",
            ITEM_ID: "No Barang",
            TARGET: "Kuantitas",
        },
        optional_mapping={
            LOCATION_ID: "Gudang",
            PRICE: "Harga Satuan",
            CATEGORY: "Kategori",
        },
        notes="Standard Accurate sales register export.",
    ),
    Preset(
        name="Jubelio — Order Items",
        vendor="Jubelio",
        required_headers=("order_date", "item_code", "qty"),
        mapping={
            TIMESTAMP: "order_date",
            ITEM_ID: "item_code",
            TARGET: "qty",
        },
        optional_mapping={
            LOCATION_ID: "location_name",
            PRICE: "price",
            INVENTORY: "available_qty",
        },
        notes="Jubelio omnichannel order export.",
    ),
    Preset(
        name="HashMicro — Inventory Movement",
        vendor="HashMicro",
        required_headers=("transaction_date", "product_code", "quantity_out"),
        mapping={
            TIMESTAMP: "transaction_date",
            ITEM_ID: "product_code",
            TARGET: "quantity_out",
        },
        optional_mapping={
            LOCATION_ID: "warehouse_code",
            INVENTORY: "stock_on_hand",
            CATEGORY: "product_category",
        },
        notes="HashMicro WMS stock movement report.",
    ),
    Preset(
        name="SimpliDOTS — Sales Order Detail",
        vendor="SimpliDOTS",
        required_headers=("tgl_order", "kode_brg", "qty_out"),
        mapping={
            TIMESTAMP: "tgl_order",
            ITEM_ID: "kode_brg",
            TARGET: "qty_out",
        },
        optional_mapping={
            LOCATION_ID: "cabang",
            PROMO: "disc",
            PRICE: "harga_net",
        },
        notes="SimpliDOTS distributor management system export.",
    ),
    Preset(
        name="Moka POS — Transaction Items",
        vendor="Moka",
        required_headers=("Date", "Item", "Quantity"),
        mapping={
            TIMESTAMP: "Date",
            ITEM_ID: "Item",
            TARGET: "Quantity",
        },
        optional_mapping={
            LOCATION_ID: "Outlet",
            PRICE: "Price",
            CATEGORY: "Category",
        },
        notes="Moka POS item sales export.",
    ),
)


def match_preset(headers: list[str]) -> tuple[Preset, dict[str, str]] | None:
    """First preset whose required headers are all present."""
    for preset in PRESETS:
        if preset.matches(headers):
            return preset, preset.resolve(headers)
    return None
