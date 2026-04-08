#!/usr/bin/env python3
"""
fetch_data.py
=============
Fetches Warframe item data from the warframestat.us community API and writes
categorised JSON files into the /data directory for the static website.

Usage:
    python scripts/fetch_data.py

Environment variables (optional):
    DATA_DIR   Override the output directory (default: data/)
    API_BASE   Override the API base URL (default: https://api.warframestat.us)
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ────────────────────────────────────────────────────────────

API_BASE = os.environ.get("API_BASE", "https://api.warframestat.us").rstrip("/")
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "data"))
REQUEST_TIMEOUT = 30
RETRY_ATTEMPTS = 3
RETRY_DELAY = 5  # seconds

# Item type → category mapping
CATEGORY_MAP = {
    "warframes":  {"file": "warframes.json",  "endpoint": "/warframes"},
    "primary":    {"file": "primary.json",    "endpoint": "/primary"},
    "secondary":  {"file": "secondary.json",  "endpoint": "/secondary"},
    "melee":      {"file": "melee.json",       "endpoint": "/melee"},
    "mods":       {"file": "mods.json",        "endpoint": "/mods"},
}

# ── Helpers ──────────────────────────────────────────────────────────────────


def fetch_json(url: str) -> object:
    """Fetch a URL and parse its JSON body, with simple retry logic."""
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "WarframeDB-CI/1.0 (+https://github.com/KnittelK/Warframe_DB)"},
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            print(f"  HTTP {exc.code} on attempt {attempt}: {url}", file=sys.stderr)
            if exc.code < 500 or attempt == RETRY_ATTEMPTS:
                raise
        except (urllib.error.URLError, OSError) as exc:
            print(f"  Network error on attempt {attempt}: {exc}", file=sys.stderr)
            if attempt == RETRY_ATTEMPTS:
                raise
        time.sleep(RETRY_DELAY)


def clean_item(item: dict) -> dict:
    """Return a trimmed-down version of an item keeping only useful fields."""
    keep = {
        "name", "description", "type", "category", "masteryReq", "rarity",
        "health", "shield", "armor", "energy", "sprint",
        "damage", "totalDamage", "accuracy", "fireRate", "criticalChance",
        "criticalMultiplier", "statusChance", "magazineSize", "reloadTime",
        "noise", "trigger", "range", "comboDuration", "blockingAngle",
        "polarity", "abilities", "wikiaThumbnail", "wikiaUrl",
    }
    return {k: v for k, v in item.items() if k in keep and v not in (None, "", [], {})}


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"  Wrote {path} ({path.stat().st_size // 1024} KB)")


# ── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    print(f"Fetching Warframe data from {API_BASE}")
    print(f"Output directory: {DATA_DIR}\n")

    success = True
    summary = {}

    for category, cfg in CATEGORY_MAP.items():
        url = f"{API_BASE}{cfg['endpoint']}?language=en"
        print(f"[{category}] GET {url}")
        try:
            raw = fetch_json(url)
        except Exception as exc:
            print(f"  ERROR: {exc}", file=sys.stderr)
            success = False
            summary[category] = {"count": 0, "error": str(exc)}
            continue

        items = raw if isinstance(raw, list) else raw.get("payload", {}).get("items", raw)
        cleaned = [clean_item(it) for it in items if isinstance(it, dict)]
        cleaned.sort(key=lambda x: x.get("name", ""))

        out_path = DATA_DIR / cfg["file"]
        write_json(out_path, {"items": cleaned})
        summary[category] = {"count": len(cleaned)}
        print(f"  → {len(cleaned)} items saved\n")

    # Write metadata file
    meta = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "categories": summary,
    }
    write_json(DATA_DIR / "meta.json", meta)
    print(f"\nDone. Summary: {json.dumps(summary, indent=2)}")
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
