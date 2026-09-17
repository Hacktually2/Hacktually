"""Environment loading.

A ten-line .env reader instead of python-dotenv, deliberately: one less package
to install over a slow connection on hackathon day, and nothing here justifies a
dependency.

Import this before anything that reads configuration. Real environment variables
always win over the file, so `GPU_INFERENCE_URL=... uvicorn ...` still overrides.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent

_loaded = False


def load_env() -> None:
    """Read backend/.env then <repo>/.env. Idempotent."""
    global _loaded
    if _loaded:
        return
    _loaded = True

    for path in (BACKEND_DIR / ".env", REPO_DIR / ".env"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # Never clobber something already set in the real environment.
            if key and key not in os.environ:
                os.environ[key] = value


load_env()
