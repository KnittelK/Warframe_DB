"""Fetch and generate docs/data/relics.json."""

from lib.fetch import fetch_json
from lib.writers import write_data_file

WARFRAMESTAT_URL = "https://api.warframestat.us/relics"

TIER_ORDER = {"Lith": 0, "Meso": 1, "Neo": 2, "Axi": 3}


def _extract_rewards(rewards_raw):
    if not isinstance(rewards_raw, list):
        return []
    return [
        {
            "itemName": r.get("itemName", r.get("item", {}).get("name", "")) if isinstance(r.get("item"), dict) else r.get("itemName", ""),
            "rarity": r.get("rarity", ""),
            "chance": r.get("chance", 0),
        }
        for r in rewards_raw
    ]


def run() -> dict:
    """Fetch, transform, and write docs/data/relics.json.
    Returns {"name": "relics", "count": int}"""
    raw = fetch_json(WARFRAMESTAT_URL, "warframestat.us/relics")

    relics = []
    for item in raw:
        if not item.get("name"):
            continue

        relic = {
            "name": item["name"],
            "tier": item.get("tier", ""),
            "relicName": item.get("relicName", ""),
            "refinement": item.get("state", "Intact"),
            "imageName": item.get("imageName", ""),
            "vaulted": item.get("vaulted", False),
            "rewards": _extract_rewards(item.get("rewards", [])),
        }
        relics.append(relic)

    relics.sort(key=lambda r: (TIER_ORDER.get(r["tier"], 99), r["name"]))
    write_data_file("relics", relics)
    print(f"Wrote {len(relics)} relics to docs/data/relics.json")

    return {"name": "relics", "count": len(relics)}
