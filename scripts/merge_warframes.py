"""Fetch and generate docs/data/warframes.json."""

from lib.fetch import fetch_json
from lib.writers import write_data_file

WARFRAMESTAT_URL = "https://api.warframestat.us/warframes"


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


def _extract_abilities(abilities_raw):
    if not isinstance(abilities_raw, list):
        return []
    return [
        {
            "name": a.get("name", ""),
            "description": a.get("description", ""),
        }
        for a in abilities_raw
    ]


def run() -> dict:
    """Fetch, transform, and write docs/data/warframes.json.
    Returns {"name": "warframes", "count": int}"""
    raw = fetch_json(WARFRAMESTAT_URL, "warframestat.us/warframes")

    warframes = []
    for item in raw:
        if not item.get("name"):
            continue

        introduced = item.get("introduced", "")
        if isinstance(introduced, dict):
            introduced = introduced.get("name", "")

        wf = {
            "name": item["name"],
            "uniqueName": item.get("uniqueName", ""),
            "imageName": item.get("imageName", ""),
            "description": item.get("description", ""),
            "masteryReq": item.get("masteryReq", 0),
            "tradable": item.get("tradable", False),
            "introduced": introduced,
            "health": item.get("health", 0),
            "shield": item.get("shield", 0),
            "armor": item.get("armor", 0),
            "power": item.get("power", 0),
            "sprintSpeed": item.get("sprintSpeed", 0),
            "passive": item.get("passiveDescription", ""),
            "abilities": _extract_abilities(item.get("abilities")),
        }

        # Build / recipe
        if "buildPrice" in item:
            wf["buildPrice"] = item["buildPrice"]
        if "buildTime" in item:
            wf["buildTime"] = item["buildTime"]
        if "skipBuildTimePrice" in item:
            wf["skipBuildTimePrice"] = item["skipBuildTimePrice"]

        components = _extract_components(item.get("components"))
        if components:
            wf["components"] = components

        warframes.append(wf)

    warframes.sort(key=lambda w: w["name"])
    write_data_file("warframes", warframes)
    print(f"Wrote {len(warframes)} warframes to docs/data/warframes.json")

    return {"name": "warframes", "count": len(warframes)}
