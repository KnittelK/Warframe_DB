"""Fetch and generate docs/data/arcanes.json."""

from lib.fetch import fetch_json
from lib.writers import write_data_file

WARFRAMESTAT_URL = "https://api.warframestat.us/arcanes"


def _extract_drops(drops_raw):
    if not isinstance(drops_raw, list):
        return []
    return [
        {
            "location": d.get("location", ""),
            "chance": d.get("chance", 0),
            "rarity": d.get("rarity", ""),
        }
        for d in drops_raw
    ]


def _extract_level_stats(level_stats_raw):
    if not isinstance(level_stats_raw, list):
        return []
    result = []
    for entry in level_stats_raw:
        if isinstance(entry, dict):
            result.append({"stats": entry.get("stats", [])})
        elif isinstance(entry, list):
            result.append({"stats": entry})
    return result


def run() -> dict:
    """Fetch, transform, and write docs/data/arcanes.json.
    Returns {"name": "arcanes", "count": int}"""
    raw = fetch_json(WARFRAMESTAT_URL, "warframestat.us/arcanes")

    arcanes = []
    for item in raw:
        if not item.get("name"):
            continue

        introduced = item.get("introduced", "")
        if isinstance(introduced, dict):
            introduced = introduced.get("name", "")

        arcane = {
            "name": item["name"],
            "uniqueName": item.get("uniqueName", ""),
            "type": item.get("type", ""),
            "rarity": item.get("rarity", ""),
            "imageName": item.get("imageName", ""),
            "tradable": item.get("tradable", False),
            "introduced": introduced,
            "levelStats": _extract_level_stats(item.get("levelStats")),
            "drops": _extract_drops(item.get("drops")),
        }
        arcanes.append(arcane)

    arcanes.sort(key=lambda a: a["name"])
    write_data_file("arcanes", arcanes)
    print(f"Wrote {len(arcanes)} arcanes to docs/data/arcanes.json")

    return {"name": "arcanes", "count": len(arcanes)}
