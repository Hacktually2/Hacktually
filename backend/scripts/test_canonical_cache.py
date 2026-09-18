"""The canonical-frame cache — that it is a cache, and that it is not a lie.

`_load_canonical` re-reads the raw upload, re-applies the column mapping and
re-runs cleaning. Every screen calls it: the chart, the demand comparison, the
per-branch trend. On a large network file that is seconds of work per request to
rebuild something that cannot have changed, so it is memoized.

A cache that serves a stale frame is worse than a slow one — it shows numbers
that belong to a file nobody uploaded any more. These checks are about that:
the answer must be identical, the frame must not be writable through into the
cache, and a changed mapping must not be served from it.

    DATA_DIR=$(mktemp -d) py -3.11 scripts/test_canonical_cache.py
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import polars as pl  # noqa: E402

from app.db import database as db  # noqa: E402
from app.services import pipeline_service as svc  # noqa: E402

passed = 0
failed = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}")
        if detail:
            print(f"        {detail}")


def sample_csv(rows: int = 4000) -> bytes:
    start = date(2024, 1, 1)
    lines = ["date,sku,branch,qty"]
    for i in range(rows):
        day = start + timedelta(days=i % 365)
        lines.append(f"{day.isoformat()},SKU-{i % 40},CAB-{i % 4:02d},{(i % 17) + 1}")
    return "\n".join(lines).encode()


def main() -> None:
    db.init()

    ingested = svc.ingest("cache_probe.csv", sample_csv())
    dataset_id = ingested["dataset_id"]
    svc.confirm_mapping(dataset_id)
    svc.invalidate_canonical()

    builds = {"n": 0}
    real_build = svc._build_canonical

    def counting_build(ds: str):
        builds["n"] += 1
        return real_build(ds)

    svc._build_canonical = counting_build
    try:
        t0 = time.perf_counter()
        first, freq_a, _, _ = svc._load_canonical(dataset_id)
        cold = time.perf_counter() - t0

        t0 = time.perf_counter()
        second, freq_b, _, _ = svc._load_canonical(dataset_id)
        warm = time.perf_counter() - t0

        check("the second read is served from cache", builds["n"] == 1, f"built {builds['n']} times")
        check("and is faster than the first", warm < cold, f"cold {cold:.3f}s warm {warm:.3f}s")
        check("the cached frame has the same shape", first.shape == second.shape,
              f"{first.shape} vs {second.shape}")
        check("and the same contents", first.equals(second))
        check("and the same detected frequency", freq_a == freq_b, f"{freq_a} vs {freq_b}")

        # The frame handed out must not be the cached object itself.
        check("callers get their own frame", first is not second)
        widened = first.with_columns(pl.lit(1).alias("_scratch"))
        third, _, _, _ = svc._load_canonical(dataset_id)
        check("building on a returned frame does not reach the cache",
              "_scratch" not in third.columns and "_scratch" in widened.columns)

        # Reports are copied out too, because `prepare` re-runs health against
        # the same object and a mutation there would accumulate.
        _, _, health_a, report_a = svc._load_canonical(dataset_id)
        _, _, health_b, report_b = svc._load_canonical(dataset_id)
        check("health dicts are not shared", health_a is not health_b)
        check("cleaning reports are not shared", report_a is not report_b)
        check("but they carry the same rows_received",
              report_a.rows_received == report_b.rows_received)

        # ---- invalidation ------------------------------------------------
        before = builds["n"]
        db.execute(
            "UPDATE dataset_sources SET uploaded_at = ? WHERE dataset_id = ?",
            ("2099-01-01T00:00:00Z", dataset_id),
        )
        svc._load_canonical(dataset_id)
        check("a changed source row is not served from cache", builds["n"] == before + 1,
              f"builds {before} -> {builds['n']}")

        before = builds["n"]
        svc.invalidate_canonical(dataset_id)
        svc._load_canonical(dataset_id)
        check("explicit invalidation forces a rebuild", builds["n"] == before + 1)
    finally:
        svc._build_canonical = real_build

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
