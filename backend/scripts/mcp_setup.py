"""Print the MCP client config for this machine, and verify the server starts.

    py -3.11 scripts/mcp_setup.py            # check + print config
    py -3.11 scripts/mcp_setup.py --write    # also write Claude Desktop's config

Connecting an MCP server to a real client reliably takes longer than writing the
server did — config path, absolute interpreter path, restart, tool discovery.
Doing that at 3am from memory is how Beat 3 of a demo dies, so it is a script.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BACKEND = Path(__file__).resolve().parents[1]
PYTHON = BACKEND / ".venv" / "Scripts" / "python.exe"
if not PYTHON.exists():
    PYTHON = BACKEND / ".venv" / "bin" / "python"

SERVER_NAME = "adaptive-forecasting"


def config() -> dict:
    """Absolute paths throughout — MCP clients do not inherit your shell."""
    env = {}
    for key in ("GPU_INFERENCE_URL", "GPU_INFERENCE_API_KEY", "SLACK_WEBHOOK_URL"):
        value = os.getenv(key)
        if value:
            env[key] = value

    entry = {
        "command": str(PYTHON),
        "args": ["-m", "app.integrations.mcp_server"],
        "cwd": str(BACKEND),
    }
    if env:
        entry["env"] = env
    return {"mcpServers": {SERVER_NAME: entry}}


def claude_desktop_config_path() -> Path | None:
    if sys.platform == "win32":
        base = os.getenv("APPDATA")
        return Path(base) / "Claude" / "claude_desktop_config.json" if base else None
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"
    return Path.home() / ".config/Claude/claude_desktop_config.json"


async def verify() -> int:
    from app import config as _cfg  # noqa: F401 — loads .env
    from app.db import database as db
    from app.integrations.mcp_server import mcp

    db.init()
    tools = await mcp.list_tools()
    print(f"Server imports cleanly. {len(tools)} tools registered:\n")
    reads, writes = [], []
    for tool in tools:
        (writes if "alert" in tool.name or "ingest" in tool.name else reads).append(tool.name)
    print("  reads (run freely):")
    for name in reads:
        print(f"    {name}")
    print("  writes (need confirmation):")
    for name in writes:
        print(f"    {name}")

    row = db.query_one("SELECT dataset_id FROM datasets ORDER BY created_at DESC LIMIT 1")
    if row:
        print(f"\n  newest dataset: {row['dataset_id']} — tools default to this one")
    else:
        print("\n  WARNING: no dataset yet. Run smoke_test.py first or the tools have nothing to answer with.")
    return len(tools)


def main() -> None:
    if not PYTHON.exists():
        print(f"No interpreter at {PYTHON} — create the venv first.")
        sys.exit(1)

    asyncio.run(verify())

    payload = config()
    print("\n" + "=" * 68)
    print("MCP client config")
    print("=" * 68)
    print(json.dumps(payload, indent=2))

    path = claude_desktop_config_path()
    print(f"\nClaude Desktop config file:\n  {path}")
    print("\nClaude Code:\n  claude mcp add-json adaptive-forecasting '<the object above>'")

    if "--write" in sys.argv and path:
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = {}
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print("\nExisting config is not valid JSON — not touching it.")
                sys.exit(1)
        existing.setdefault("mcpServers", {})[SERVER_NAME] = payload["mcpServers"][SERVER_NAME]
        path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        print(f"\nWritten. Restart Claude Desktop, then ask it:")
        print('  "Which products are at risk of stocking out this week?"')
    else:
        print("\nRe-run with --write to merge this into Claude Desktop's config.")


if __name__ == "__main__":
    main()
