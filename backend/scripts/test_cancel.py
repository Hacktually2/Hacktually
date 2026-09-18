"""Cancelling a running forecast — the state machine, not the pipeline.

A forecast is a FastAPI background task with no handle to kill, so cancelling is
cooperative: the route marks the row and the run unwinds at its next progress
report. The failure modes worth guarding are all about that gap.

  - A cancel that lands while the final batch finishes must not be overwritten
    by the `completed` write a moment later.
  - Nor by the `failed` write, when the run unwinds through the same `except`.
  - The processing screen must be able to tell a cancelled job from a queued
    one, which it cannot if any step is still reported `active`.

Runs against a throwaway database, so it never touches real data:

    DATA_DIR=$(mktemp -d) py -3.11 scripts/test_cancel.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app.api import routes  # noqa: E402
from app.db import database as db  # noqa: E402
from app.services import view_models as views  # noqa: E402

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


def make_job(job_id: str, status: str = "running", stage: str = "validating") -> None:
    db.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
    db.execute(
        """INSERT INTO jobs (job_id, dataset_id, status, progress, stage, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)""",
        (job_id, "ds_test", status, 38, stage, routes._now(), routes._now()),
    )


def status_of(job_id: str) -> str:
    return db.query_one("SELECT status FROM jobs WHERE job_id = ?", (job_id,))["status"]


def main() -> None:
    db.init()

    # ---- the happy path --------------------------------------------------
    make_job("job_running")
    result = routes.cancel_job("job_running")
    check("cancelling a running job reports it cancelled", result["cancelled"] is True, str(result))
    check("and the row says so", status_of("job_running") == "cancelled", status_of("job_running"))

    # ---- idempotence -----------------------------------------------------
    again = routes.cancel_job("job_running")
    check("cancelling twice is not an error", again["cancelled"] is False, str(again))
    check("and does not change the row", status_of("job_running") == "cancelled")

    # ---- a job that already finished ------------------------------------
    make_job("job_done", status="completed")
    done = routes.cancel_job("job_done")
    check("a completed job cannot be cancelled", done["cancelled"] is False, str(done))
    check("and stays completed", status_of("job_done") == "completed")

    # ---- an id that does not exist --------------------------------------
    try:
        routes.cancel_job("job_nope")
        check("unknown job is a 404", False, "no exception raised")
    except HTTPException as exc:
        check("unknown job is a 404", exc.status_code == 404, str(exc.status_code))

    # ---- the race this was written for ----------------------------------
    # Both terminal writes carry `AND status = 'running'`. Without it, a run
    # that was cancelled mid-batch reports success a second later and the
    # screen that just said "cancelled" changes its mind.
    make_job("job_race")
    routes.cancel_job("job_race")
    db.execute(
        """UPDATE jobs SET status = 'completed', progress = 100, updated_at = ?
           WHERE job_id = ? AND status = 'running'""",
        (routes._now(), "job_race"),
    )
    check("a late 'completed' write cannot resurrect a cancelled job",
          status_of("job_race") == "cancelled", status_of("job_race"))

    db.execute(
        """UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
           WHERE job_id = ? AND status = 'running'""",
        ("boom", routes._now(), "job_race"),
    )
    check("nor can a late 'failed' write",
          status_of("job_race") == "cancelled", status_of("job_race"))

    # ---- what the processing screen reads -------------------------------
    view = views.job("job_running")
    check("the job view reports the cancelled status", view["status"] == "cancelled", str(view["status"]))
    check("progress is left where it stopped", view["progress"] == 38, str(view["progress"]))
    states = {step["state"] for step in view["steps"]}
    check("no step is left active on a cancelled job", "active" not in states, str(states))

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
