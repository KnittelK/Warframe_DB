"""Utilities for writing pipeline output to docs/data/."""

import json
from datetime import datetime, timezone
from pathlib import Path

OUT_DIR = Path(__file__).parents[2] / "docs" / "data"


def write_data_file(name: str, data: list | dict) -> None:
    """Write docs/data/{name}.json as minified JSON (no indent)."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


def update_meta(fields: dict) -> None:
    """Read docs/data/meta.json, merge in fields, write back with indent=2.
    Always sets lastUpdated to current UTC ISO timestamp."""
    meta_path = OUT_DIR / "meta.json"
    meta: dict = {}
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta.update(fields)
    meta["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
