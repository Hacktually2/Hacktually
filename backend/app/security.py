"""Access control for a service that deliberately has no user accounts.

The frontend owns identity: who someone is, and which branches they manage,
lives in its auth layer. This service must never duplicate that — two places
deciding who sees what is how they drift apart and one of them starts being
wrong quietly.

So there are exactly two things enforced here, and neither is authentication:

**A shared key**, so the service cannot be read by anything that is not the
app's own server. Without it the only thing protecting every customer's sales
history is that nobody has found port 8000, which is not a control.

**A tenant boundary**, so one company's data cannot be reached with another
company's request even when the key is correct. A dataset is stamped with the
tenant that uploaded it, and a request carrying a different tenant gets a 404 —
not a 403, because "this exists but is not yours" is itself a disclosure.

Both are opt-in. With no key configured the service stays open and says so in
the log on every start, which keeps local development frictionless and makes the
deployed case the one that has to be configured rather than the one that has to
be remembered.

Trusting the proxy is the same trust model `?location=` already uses: the caller
has checked access, and this service enforces what the caller declares. That is
sound only while the browser cannot reach this service directly, which is why
CORS is off.
"""

from __future__ import annotations

import hmac
import logging
import os

from fastapi import HTTPException, Request

log = logging.getLogger(__name__)

API_KEY_HEADER = "X-API-Key"
TENANT_HEADER = "X-Tenant-Id"

# Read by the browser's own fetches in dev tooling and by monitoring, so they
# stay open even when a key is set.
OPEN_PATHS = ("/health", "/docs", "/openapi.json", "/redoc")


def configured_key() -> str:
    return os.getenv("BACKEND_API_KEY", "").strip()


def auth_enabled() -> bool:
    return bool(configured_key())


def tenancy_enabled() -> bool:
    """Tenant checks only mean something once a key gates who may declare one."""
    return auth_enabled() and os.getenv("BACKEND_REQUIRE_TENANT", "1") not in ("0", "false", "no")


def startup_warning() -> str | None:
    if auth_enabled():
        return None
    return (
        "BACKEND_API_KEY is not set: this service is open to anything that can "
        "reach it. Acceptable only while it is unreachable from outside the "
        "host. Set it before deploying anywhere a browser can reach."
    )


def check_key(request: Request) -> None:
    """Constant-time compare, so a wrong key cannot be found one byte at a time."""
    expected = configured_key()
    if not expected:
        return
    supplied = request.headers.get(API_KEY_HEADER, "")
    if not supplied or not hmac.compare_digest(supplied, expected):
        # Deliberately terse: an error that explains what was wrong with the key
        # is an error that helps guess the key.
        raise HTTPException(status_code=401, detail="unauthorised")


def tenant_of(request: Request) -> str | None:
    """The tenant the caller claims to be acting for."""
    value = (request.headers.get(TENANT_HEADER) or "").strip()
    if value:
        return value[:120]
    if tenancy_enabled():
        raise HTTPException(
            status_code=400,
            detail=f"{TENANT_HEADER} is required when BACKEND_API_KEY is set",
        )
    return None


def dataset_ids_in_path(path: str) -> list[str]:
    """Dataset ids mentioned anywhere in a URL path.

    Ids carry a `ds_` prefix and jobs a `job_` prefix, which is what makes a
    single gate possible: rather than remembering to guard twenty-five routes
    and getting twenty-four of them right, the check reads the path. A route
    added tomorrow is covered the moment it is added.

    Requests that name the dataset in the body instead — the branch digest —
    still guard inside the route, because a middleware cannot read the body
    without consuming it.
    """
    found = []
    for segment in path.split("/"):
        if segment.startswith("ds_"):
            found.append(segment)
        elif segment.startswith("prj-ds_"):
            found.append(segment[4:])
    return found


def job_ids_in_path(path: str) -> list[str]:
    return [seg for seg in path.split("/") if seg.startswith("job_")]


def assert_tenant(owner: str | None, claimed: str | None) -> None:
    """Refuse a dataset belonging to someone else, without confirming it exists.

    A 403 here would tell an attacker that the id is real and belongs to another
    company. 404 says only that they have nothing by that name.
    """
    if not tenancy_enabled():
        return
    if owner and owner != claimed:
        raise HTTPException(status_code=404, detail="dataset not found")
