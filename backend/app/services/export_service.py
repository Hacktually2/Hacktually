"""CSV export for people, not systems.

The REST API already serves machines and MCP already serves agents. This is for
the human in the middle — and in this market that person lives in Excel. A
purchase order gets assembled in a spreadsheet and emailed to a supplier, so a
download that opens cleanly in Excel is used more often than any integration.

Two details that sound trivial and are not:

1. **Excel on an Indonesian locale reads `;` as the column separator**, not `,`.
   Emit a normal comma CSV and the whole row lands in column A, the file looks
   broken, and the user concludes the product is broken. We emit a `sep=` hint
   line, which Excel honours and other tools ignore.

2. **UTF-8 needs a BOM** for Excel to render it as UTF-8. Without it, Indonesian
   text and the rupiah sign come out as mojibake.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from ..db import database as db
from . import pipeline_service as svc

BOM = "﻿"


def _writer(delimiter: str) -> tuple[io.StringIO, csv.writer]:
    buffer = io.StringIO()
    if delimiter != ",":
        # Excel reads this line and uses the delimiter; pandas/polars skip it
        # when told to, and everything else treats it as a comment row.
        buffer.write(f"sep={delimiter}\n")
    return buffer, csv.writer(buffer, delimiter=delimiter, lineterminator="\n")


def _finish(buffer: io.StringIO) -> str:
    return BOM + buffer.getvalue()


def filename(dataset_id: str, kind: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"{kind}_{dataset_id}_{stamp}.csv"


def recommendations_csv(dataset_id: str, delimiter: str = ";", limit: int = 10_000) -> str:
    """The action list. What to order, how much, and why — in one sheet."""
    rows = svc.get_recommendations(dataset_id, limit=limit)
    buffer, writer = _writer(delimiter)

    writer.writerow([
        "item", "lokasi", "kategori", "pola_permintaan", "risiko",
        "hari_sampai_habis", "stok_sekarang", "permintaan_lead_time",
        "safety_buffer", "jumlah_pesan", "kebutuhan_bahan_baku",
        "model", "wape_backtest", "alasan_model", "parameter_diasumsikan",
    ])

    for r in rows:
        explanation = {line["label"]: line["value"] for line in r.get("explanation", [])}
        lead_demand = next(
            (v for k, v in explanation.items() if k.startswith("Demand during")), ""
        )
        safety = next(
            (v for k, v in explanation.items() if k.startswith("Safety buffer")), ""
        )
        stock = next((abs(v) for k, v in explanation.items() if k == "Current stock"), "")

        writer.writerow([
            r.get("item_id") or "",
            r.get("location_id") or "",
            r.get("category") or "",
            r.get("demand_class") or "",
            r.get("stockout_risk") or "",
            r.get("days_until_stockout") if r.get("days_until_stockout") is not None else "",
            stock,
            lead_demand,
            safety,
            round(r.get("recommended_qty") or 0, 1),
            round(r["raw_material_qty"], 1) if r.get("raw_material_qty") else "",
            r.get("model_name") or "",
            f"{r['wape']:.3f}" if r.get("wape") is not None else "",
            r.get("reason") or "",
            ", ".join(r.get("missing_params") or []),
        ])

    return _finish(buffer)


def purchase_orders_csv(dataset_id: str, delimiter: str = ";", min_qty: float = 1.0) -> str:
    """One block per branch, shaped like something you would send a supplier.

    Grouped rather than flat because a purchase order goes to one branch's
    supplier, not to the whole network at once. Zero-quantity lines are dropped —
    nobody wants to scroll past 300 rows of "order nothing".
    """
    rows = [
        r for r in svc.get_recommendations(dataset_id, limit=10_000)
        if (r.get("recommended_qty") or 0) >= min_qty
    ]

    by_branch: dict[str, list[dict]] = {}
    for r in rows:
        by_branch.setdefault(r.get("location_id") or "TANPA LOKASI", []).append(r)

    buffer, writer = _writer(delimiter)
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for branch in sorted(by_branch):
        items = sorted(by_branch[branch], key=lambda x: -(x.get("recommended_qty") or 0))
        total = sum(x.get("recommended_qty") or 0 for x in items)
        urgent = sum(1 for x in items if x.get("stockout_risk") == "high")

        writer.writerow([f"USULAN PEMBELIAN - {branch}"])
        writer.writerow([f"Dibuat {generated}", f"{len(items)} item",
                         f"total {total:,.0f} unit", f"{urgent} mendesak"])
        writer.writerow([])
        writer.writerow(["item", "jumlah_pesan", "risiko", "hari_sampai_habis", "catatan"])

        for item in items:
            days = item.get("days_until_stockout")
            note = (
                f"habis dalam {days} hari" if days is not None and days <= 7
                else "prioritas normal"
            )
            writer.writerow([
                item.get("item_id") or item["series_id"],
                round(item.get("recommended_qty") or 0, 1),
                item.get("stockout_risk") or "",
                days if days is not None else "",
                note,
            ])

        writer.writerow([])
        writer.writerow(["", "TOTAL", round(total, 1)])
        writer.writerow([])
        writer.writerow([])

    return _finish(buffer)


def forecasts_csv(dataset_id: str, delimiter: str = ";", limit: int = 200_000) -> str:
    """Per-period forecast with intervals. The sheet an analyst actually wants."""
    rows = db.query(
        """SELECT f.series_id, s.item_id, s.location_id, f.timestamp,
                  f.forecast, f.lower, f.upper, f.model_name
           FROM forecasts f
           LEFT JOIN series_profiles s
             ON s.dataset_id = f.dataset_id AND s.series_id = f.series_id
           WHERE f.dataset_id = ?
           ORDER BY f.series_id, f.timestamp
           LIMIT ?""",
        (dataset_id, limit),
    )

    buffer, writer = _writer(delimiter)
    writer.writerow([
        "item", "lokasi", "tanggal", "ramalan", "batas_bawah", "batas_atas", "model",
    ])
    for r in rows:
        writer.writerow([
            r["item_id"] or "",
            r["location_id"] or "",
            str(r["timestamp"])[:10],
            round(r["forecast"] or 0, 2),
            round(r["lower"], 2) if r["lower"] is not None else "",
            round(r["upper"], 2) if r["upper"] is not None else "",
            r["model_name"] or "",
        ])
    return _finish(buffer)


def data_health_csv(dataset_id: str, delimiter: str = ";") -> str:
    """What we found and what to fix — the onboarding deliverable, as a sheet."""
    health = svc.get_health(dataset_id)
    buffer, writer = _writer(delimiter)

    writer.writerow(["LAPORAN KESEHATAN DATA"])
    writer.writerow(["skor", health.get("health_score")])
    writer.writerow(["frekuensi", health.get("frequency")])
    writer.writerow(["periode", health.get("periods")])
    writer.writerow(["series total", health.get("series_total")])
    writer.writerow(["series bisa diramal", health.get("series_forecastable")])
    writer.writerow([])

    writer.writerow(["TEMUAN"])
    for finding in health.get("findings", []):
        writer.writerow([finding.get("level"), finding.get("text")])
    writer.writerow([])

    excluded = health.get("series_excluded", [])
    if excluded:
        writer.writerow([f"SERIES YANG BELUM BISA DIRAMAL ({health.get('series_excluded_count', len(excluded))})"])
        writer.writerow(["series", "alasan", "yang perlu dilakukan"])
        for item in excluded:
            writer.writerow([item.get("series_id"), item.get("reason"), item.get("fix")])

    return _finish(buffer)


EXPORTS = {
    "recommendations": recommendations_csv,
    "purchase-orders": purchase_orders_csv,
    "forecasts": forecasts_csv,
    "data-health": data_health_csv,
}
