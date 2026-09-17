"""Access control, tenant isolation, personal-data detection and erasure.

Two things these cases exist to prevent.

First, that turning security on breaks the app. Everything here is opt-in, so
the default path — no key configured — must behave exactly as before, or nobody
will turn it on.

Second, that turning it on only half works. A gate that covers twenty-four of
twenty-five routes is not a gate, so the isolation cases walk every family of
dataset-scoped URL rather than a sample.

    py -3.11 scripts/test_security.py
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import polars as pl  # noqa: E402

from app.db import database as db  # noqa: E402

DEMO = Path(__file__).resolve().parents[2] / "data" / "demo" / "distributor_generic.csv"
KEY = "test-key-please-ignore"

passed = 0
failed = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def client(key: str | None = None, tenant: str | None = None):
    """A fresh app, because the middleware reads the environment at request time."""
    for name in ("app.security", "app.main"):
        if name in sys.modules:
            importlib.reload(sys.modules[name])
    from fastapi.testclient import TestClient
    import app.main as main

    importlib.reload(main)
    headers = {}
    if key:
        headers["X-API-Key"] = key
    if tenant:
        headers["X-Tenant-Id"] = tenant
    return TestClient(main.app, headers=headers)


def test_open_by_default() -> None:
    print("OPEN BY DEFAULT\n")
    os.environ.pop("BACKEND_API_KEY", None)
    with client() as c:
        health = c.get("/health").json()
        check("no key configured means no key required", health["auth"]["api_key_required"] is False)
        check("tenant isolation off with no key", health["auth"]["tenant_isolation"] is False)
        check("reads work with no headers at all", c.get("/api/v1/datasets").status_code == 200)
        check("health says CORS is gone", "access-control-allow-origin" not in
              {k.lower() for k in c.get("/health").headers})


def test_key_required() -> None:
    print("\nSHARED KEY\n")
    os.environ["BACKEND_API_KEY"] = KEY
    try:
        with client() as c:
            check("no key is refused", c.get("/api/v1/datasets").status_code == 401)
        with client(key="wrong") as c:
            check("a wrong key is refused", c.get("/api/v1/datasets").status_code == 401)
            body = c.get("/api/v1/datasets").json()
            check(
                "the refusal does not describe the key",
                "key" not in str(body.get("detail", "")).lower()
                or body.get("detail") == "unauthorised",
                str(body),
            )
        with client(key=KEY, tenant="acme") as c:
            check("the right key is accepted", c.get("/api/v1/datasets").status_code == 200)
            check("/health stays open for monitoring", c.get("/health").status_code == 200)
        with client(key=KEY) as c:
            check(
                "a missing tenant header is refused once a key is set",
                c.get("/api/v1/datasets").status_code == 400,
            )
    finally:
        os.environ.pop("BACKEND_API_KEY", None)


def test_tenant_isolation() -> None:
    print("\nTENANT ISOLATION\n")
    frame = pl.read_csv(DEMO).head(4000)
    os.environ["BACKEND_API_KEY"] = KEY
    try:
        # Two tenants upload the same file. Neither may see the other's copy.
        with client(key=KEY, tenant="acme") as c:
            acme = c.post(
                "/api/v1/ingest",
                files={"file": ("a.csv", frame.write_csv().encode(), "text/csv")},
            ).json()["dataset_id"]
        with client(key=KEY, tenant="globex") as c:
            globex = c.post(
                "/api/v1/ingest",
                files={"file": ("b.csv", frame.write_csv().encode(), "text/csv")},
            ).json()["dataset_id"]

        with client(key=KEY, tenant="globex") as c:
            # Every family of dataset-scoped URL, not a sample.
            paths = [
                f"/api/v1/datasets/{acme}/mapping",
                f"/api/v1/datasets/{acme}/health",
                f"/api/v1/datasets/{acme}/sources",
                f"/api/v1/datasets/{acme}/params",
                f"/api/v1/datasets/{acme}/privacy",
                f"/api/v1/overview/{acme}",
                f"/api/v1/demand/{acme}",
                f"/api/v1/recommendations/{acme}",
                f"/api/v1/value/{acme}",
                f"/api/v1/usage/{acme}",
                f"/api/v1/forecasts/{acme}",
                f"/api/v1/branches/{acme}",
                f"/api/v1/branches/{acme}/list",
                f"/api/v1/export/{acme}/recommendations",
                f"/api/v1/projects/prj-{acme}",
            ]
            leaked = [p for p in paths if c.get(p).status_code != 404]
            check(
                f"all {len(paths)} dataset URLs refuse another tenant",
                not leaked,
                f"leaked: {leaked[:3]}",
            )
            check(
                "refusal is 404, not 403 — existence is not confirmed",
                c.get(f"/api/v1/overview/{acme}").status_code == 404,
            )
            check(
                "a write is refused too",
                c.delete(f"/api/v1/datasets/{acme}").status_code == 404,
            )
            listed = {d["dataset_id"] for d in c.get("/api/v1/datasets").json()}
            check("the listing hides other tenants", acme not in listed and globex in listed)
            projects = {p["dataset_id"] for p in c.get("/api/v1/projects").json()}
            check("the project chooser hides other tenants", acme not in projects)

        with client(key=KEY, tenant="acme") as c:
            check("the owner still gets its own dataset", c.get(f"/api/v1/overview/{acme}").status_code == 200)
            c.delete(f"/api/v1/datasets/{acme}")
        with client(key=KEY, tenant="globex") as c:
            c.delete(f"/api/v1/datasets/{globex}")
    finally:
        os.environ.pop("BACKEND_API_KEY", None)


def test_pii() -> None:
    print("\nPERSONAL DATA\n")
    from app.schema import pii
    from app.schema.profiler import profile_dataframe

    frame = pl.DataFrame({
        "tanggal": ["2026-01-01", "2026-01-02", "2026-01-03"],
        "kode_produk": ["SKU-1", "SKU-2", "SKU-3"],
        "qty": [4, 7, 2],
        "email_pelanggan": ["a@b.com", "c@d.co.id", "e@f.org"],
        "no_hp": ["081234567890", "6285712345678", "081199887766"],
        "nik": ["3174010101010001", "3174010101010002", "3174010101010003"],
        "nama_pelanggan": ["Budi Santoso", "Siti Aminah", "Joko Widodo"],
        "harga": [10000, 20000, 15000],
    })
    profiles = profile_dataframe(frame)
    result = pii.scan(profiles, mapped_columns={"tanggal", "qty", "kode_produk", "harga"})
    kinds = {c["kind"] for c in result["columns"]}

    check("finds an email column", "email" in kinds)
    check("finds an Indonesian phone number", "phone_id" in kinds, str(kinds))
    check("finds a NIK", "nik" in kinds)
    check("finds a name column from its name", "person_name" in kinds)
    check("does not flag quantity, price or date", not ({"qty", "harga", "tanggal"} & {c["column"] for c in result["columns"]}))
    check("nothing flagged is used by the forecast", not result["in_use"])

    finding = pii.as_finding(result)
    check("produces a health finding", finding is not None and finding["severity"] == "warning")

    # Now the personal column feeds the forecast — that is more serious.
    worse = pii.scan(profiles, mapped_columns={"tanggal", "no_hp"})
    finding = pii.as_finding(worse)
    check(
        "personal data used by the forecast is critical",
        finding["severity"] == "critical",
        str(finding),
    )

    clean = pl.DataFrame({
        "tanggal": ["2026-01-01", "2026-01-02", "2026-01-03"],
        "kode_produk": ["SKU-1", "SKU-2", "SKU-3"],
        "qty": [4, 7, 2],
    })
    empty = pii.scan(profile_dataframe(clean))
    check("a clean file reports nothing", not empty["found"])
    check("and produces no finding", pii.as_finding(empty) is None)


def test_erasure() -> None:
    print("\nERASURE\n")
    from app.services import pipeline_service as svc

    frame = pl.read_csv(DEMO).head(3000)
    ds = svc.ingest("purge.csv", frame.write_csv().encode())["dataset_id"]
    svc.confirm_mapping(ds)
    svc.prepare(ds)

    files = [Path(r["raw_path"]) for r in db.query(
        "SELECT raw_path FROM dataset_sources WHERE dataset_id = ?", (ds,)
    )]
    check("the uploaded file is on disk before erasure", all(f.exists() for f in files))

    result = svc.purge(ds)
    check("the uploaded file is gone after erasure", not any(f.exists() for f in files))
    check("rows are gone", not db.query_one("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds,)))
    check(
        "derived rows are gone too",
        not db.query_one("SELECT 1 FROM series_profiles WHERE dataset_id = ?", (ds,)),
    )
    check("it reports what it removed", result["files_removed"] >= 1 and result["deleted_rows"])


def test_privacy_report() -> None:
    print("\nPRIVACY REPORT\n")
    from app.services import pipeline_service as svc

    frame = pl.read_csv(DEMO).head(2000)
    ds = svc.ingest("privacy.csv", frame.write_csv().encode())["dataset_id"]
    report = svc.privacy_report(ds)

    check("says where uploads are stored", "location" in report["stored"])
    check("lists what leaves the service", len(report["leaves_this_service"]) >= 2)
    gpu = next(d for d in report["leaves_this_service"] if "GPU" in d["destination"])
    check(
        "is specific that only unlabelled quantities go to the GPU",
        "numeric series" in gpu["what"] and "item names and codes" in gpu["not_sent"],
    )
    check("states what never leaves", "the uploaded file itself" in report["never_sent_anywhere"])
    svc.purge(ds)


def main() -> None:
    db.init()
    test_open_by_default()
    test_key_required()
    test_tenant_isolation()
    test_pii()
    test_erasure()
    test_privacy_report()
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
