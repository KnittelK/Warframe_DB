"""Fetch and generate docs/data/weapons.json (Primary, Secondary, Melee)."""

from lib.fetch import fetch_json
from lib.writers import write_data_file

WARFRAMESTAT_URL = "https://api.warframestat.us/weapons"

CATEGORIES = {"Primary", "Secondary", "Melee"}


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


def _extract_components(components_raw):
    if not isinstance(components_raw, list):
        return []
    result = []
    for c in components_raw:
        comp = {
            "name": c.get("name", ""),
            "itemCount": c.get("itemCount", 1),
            "imageName": c.get("imageName", ""),
            "drops": _extract_drops(c.get("drops")),
        }
        result.append(comp)
    return result


def run() -> dict:
    """Fetch, transform, and write docs/data/weapons.json.
    Returns {"name": "weapons", "count": int}"""
    raw = fetch_json(WARFRAMESTAT_URL, "warframestat.us/weapons")

    weapons = []
    for item in raw:
        category = item.get("category", "")
        if category not in CATEGORIES:
            continue
        if not item.get("name"):
            continue

        weapon = {
            "name": item["name"],
            "uniqueName": item.get("uniqueName", ""),
            "category": category,
            "type": item.get("type", ""),
            "masteryReq": item.get("masteryReq", 0),
            "imageName": item.get("imageName", ""),
            "description": item.get("description", ""),
            "tradable": item.get("tradable", False),
            "introduced": item.get("introduced", {}).get("name", "") if isinstance(item.get("introduced"), dict) else item.get("introduced", ""),
        }

        # Combat stats — omit key if not present in source
        if "damage" in item:
            weapon["damage"] = item["damage"]
        if "totalDamage" in item:
            weapon["totalDamage"] = item["totalDamage"]
        if "fireRate" in item:
            weapon["fireRate"] = item["fireRate"]
        if "criticalChance" in item:
            weapon["criticalChance"] = item["criticalChance"]
        if "criticalMultiplier" in item:
            weapon["criticalMultiplier"] = item["criticalMultiplier"]
        if "procChance" in item:
            weapon["procChance"] = item["procChance"]
        if "accuracy" in item:
            weapon["accuracy"] = item["accuracy"]
        if "magazineSize" in item:
            weapon["magazineSize"] = item["magazineSize"]
        if "reloadTime" in item:
            weapon["reloadTime"] = item["reloadTime"]
        if "trigger" in item:
            weapon["trigger"] = item["trigger"]
        if "disposition" in item:
            weapon["disposition"] = item["disposition"]

        # Build / recipe
        if "buildPrice" in item:
            weapon["buildPrice"] = item["buildPrice"]
        if "buildTime" in item:
            weapon["buildTime"] = item["buildTime"]
        if "skipBuildTimePrice" in item:
            weapon["skipBuildTimePrice"] = item["skipBuildTimePrice"]

        components = _extract_components(item.get("components"))
        if components:
            weapon["components"] = components

        drops = _extract_drops(item.get("drops"))
        if drops:
            weapon["drops"] = drops

        weapons.append(weapon)

    weapons.sort(key=lambda w: w["name"])
    write_data_file("weapons", weapons)
    print(f"Wrote {len(weapons)} weapons to docs/data/weapons.json")

    return {"name": "weapons", "count": len(weapons)}
