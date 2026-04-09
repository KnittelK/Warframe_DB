#!/usr/bin/env python3
"""Orchestrator: runs all merge_* pipelines concurrently and updates meta.json."""

import sys
from pathlib import Path

# Ensure scripts/ is on sys.path so sibling modules resolve correctly.
sys.path.insert(0, str(Path(__file__).parent))

from concurrent.futures import ThreadPoolExecutor, as_completed

import merge_mods
from lib import writers

PIPELINES = [merge_mods]  # #4-7 will add to this list


def main() -> None:
    results: dict[str, dict] = {}

    with ThreadPoolExecutor() as executor:
        futures = {executor.submit(p.run): p for p in PIPELINES}
        for future in as_completed(futures):
            pipeline = futures[future]
            try:
                result = future.result()
                results[result["name"]] = result
                print(f"\u2713 {result['name']}: {result['count']} items")
            except Exception as e:
                print(f"\u2717 {pipeline.__name__}: {e}")

    mod_result = results.get("mods", {})
    writers.update_meta(
        {
            "modCount": mod_result.get("count", 0),
            "deAvailable": mod_result.get("deAvailable", False),
        }
    )
    print("Wrote meta.json")


if __name__ == "__main__":
    main()
