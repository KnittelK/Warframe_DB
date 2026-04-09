"""Fetch and merge Warframe mod data from DE Public Export and warframestat.us."""

import re

from lib.fetch import fetch_json, fetch_json_optional
from lib.writers import write_data_file

DE_EXPORT_URL = (
    "https://content.warframe.com/PublicExport/Manifest/ExportUpgrades.json"
)
WARFRAMESTAT_URL = "https://api.warframestat.us/mods"


def _normalize_type(raw: str | None) -> str:
    if not raw:
        return "Unknown"
    s = re.sub(r" Mod$", "", raw, flags=re.IGNORECASE).strip()
    return s[0].upper() + s[1:] if s else "Unknown"


def _extract_stat_types(level_stats: list) -> list:
    types: set[str] = set()
    if not isinstance(level_stats, list):
        return []
    for level in level_stats:
        entries = level.get("stats", level) if isinstance(level, dict) else level
        if not isinstance(entries, list):
            continue
        for stat in entries:
            m = re.match(
                r"^[+\-]?[\d.]+[%]?\s+(.+?)(?:\s+(?:for|on|while|per|at)\b.*)?$",
                str(stat),
                re.IGNORECASE,
            )
            if m:
                types.add(m.group(1).strip())
    return list(types)


def run() -> dict:
    """Fetch, merge, and write docs/data/mods.json.
    Returns {"name": "mods", "count": int, "deAvailable": bool}"""
    de_raw = fetch_json_optional(DE_EXPORT_URL, "DE Public Export")
    wf_mods = fetch_json(WARFRAMESTAT_URL, "warframestat.us")

    # Index DE data by uniqueName
    de_by_name: dict = {}
    if de_raw is not None:
        de_upgrades = (
            de_raw.get("ExportUpgrades", de_raw)
            if isinstance(de_raw, dict)
            else de_raw
        )
        de_list = de_upgrades if isinstance(de_upgrades, list) else []
        for mod in de_list:
            if mod.get("uniqueName"):
                de_by_name[mod["uniqueName"]] = mod
        print(f"DE export: {len(de_by_name)} upgrades indexed")

    print(f"warframestat.us: {len(wf_mods)} mods fetched")

    merged = []
    for wf in wf_mods:
        if not wf.get("name"):
            continue

        de = de_by_name.get(wf.get("uniqueName", ""), {})
        level_stats = de.get("levelStats") or wf.get("levelStats") or []

        mod = {
            "name": wf["name"],
            "uniqueName": wf.get("uniqueName", ""),
            "type": _normalize_type(wf.get("type")),
            "compatName": (de.get("compatName") or wf.get("compatName") or "").upper(),
            "rarity": wf.get("rarity") or de.get("rarity") or "Common",
            "polarity": wf.get("polarity") or de.get("polarity") or "",
            "baseDrain": de["baseDrain"] if "baseDrain" in de else wf.get("baseDrain", 0),
            "fusionLimit": de["fusionLimit"] if "fusionLimit" in de else wf.get("fusionLimit", 0),
            "description": wf.get("description", ""),
            "levelStats": level_stats,
            "statTypes": _extract_stat_types(level_stats),
            "drops": [
                {
                    "location": d.get("location", ""),
                    "type": d.get("type", ""),
                    "chance": d.get("chance", 0),
                }
                for d in (wf.get("drops") or [])
            ],
            "imageName": wf.get("imageName", ""),
            "wikiaThumbnail": wf.get("wikiaThumbnail", ""),
            "tradable": wf.get("tradable", False),
        }
        merged.append(mod)

    # Sort alphabetically
    merged.sort(key=lambda m: m["name"])

    write_data_file("mods", merged)
    print(f"Wrote {len(merged)} mods to docs/data/mods.json")

    return {"name": "mods", "count": len(merged), "deAvailable": len(de_by_name) > 0}
