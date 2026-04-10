"""Fetch and merge Warframe mod data from DE Public Export and warframestat.us.

Drop locations are enriched with planet/mission context via the warframestat.us
nodes endpoint, and mod metadata (isAugment, isExilus, etc.) is supplemented
from the warframe-items CDN package.
"""

import re

from lib.fetch import fetch_json, fetch_json_optional
from lib.writers import write_data_file

DE_EXPORT_URL = (
    "https://content.warframe.com/PublicExport/Manifest/ExportUpgrades.json"
)
WARFRAMESTAT_URL = "https://api.warframestat.us/mods"
WARFRAMESTAT_NODES_URL = "https://api.warframestat.us/nodes"
WFCD_MODS_URL = (
    "https://cdn.jsdelivr.net/npm/@wfcd/items@latest/data/json/Mods.json"
)


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


def _build_nodes_map(nodes_raw: dict | list | None) -> dict:
    """Build a lookup from display name (lowercase) to node info dict.

    warframestat.us /nodes returns a dict keyed by internal path; each entry
    has 'value' (display name), 'systemName' (planet), 'type' (mission type),
    'enemy' (faction), and enemy level range.
    """
    nodes_map: dict = {}
    if not nodes_raw:
        return nodes_map
    items = nodes_raw.values() if isinstance(nodes_raw, dict) else nodes_raw
    for node in items:
        if not isinstance(node, dict):
            continue
        display = node.get("value") or node.get("name") or node.get("label")
        if not display:
            continue
        nodes_map[display.lower()] = {
            "planet": node.get("systemName") or node.get("planet") or "",
            "missionType": node.get("type") or node.get("missionType") or "",
            "faction": node.get("enemy") or node.get("faction") or "",
            "levelMin": node.get("minEnemyLevel") or node.get("levelMin") or 0,
            "levelMax": node.get("maxEnemyLevel") or node.get("levelMax") or 0,
        }
    return nodes_map


def _build_wfcd_metadata(wfcd_mods: list | None) -> dict:
    """Build a lookup by uniqueName from the warframe-items Mods.json."""
    if not isinstance(wfcd_mods, list):
        return {}
    meta: dict = {}
    for mod in wfcd_mods:
        un = mod.get("uniqueName")
        if un:
            meta[un] = mod
    return meta


def _get_introduced(introduced) -> str:
    """Normalize the 'introduced' field to a plain string."""
    if not introduced:
        return ""
    if isinstance(introduced, dict):
        return introduced.get("name") or introduced.get("version") or ""
    return str(introduced)


def run() -> dict:
    """Fetch, merge, and write docs/data/mods.json.
    Returns {"name": "mods", "count": int, "deAvailable": bool}"""
    de_raw = fetch_json_optional(DE_EXPORT_URL, "DE Public Export")
    wf_mods = fetch_json(WARFRAMESTAT_URL, "warframestat.us/mods")
    nodes_raw = fetch_json_optional(WARFRAMESTAT_NODES_URL, "warframestat.us/nodes")
    wfcd_raw = fetch_json_optional(WFCD_MODS_URL, "warframe-items CDN")

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

    nodes_map = _build_nodes_map(nodes_raw)
    print(f"Nodes map: {len(nodes_map)} nodes indexed")

    wfcd_by_name = _build_wfcd_metadata(wfcd_raw)
    print(f"warframe-items: {len(wfcd_by_name)} mods indexed")

    print(f"warframestat.us: {len(wf_mods)} mods fetched")

    enriched_drops = 0
    total_drops = 0
    merged = []
    for wf in wf_mods:
        if not wf.get("name"):
            continue

        de = de_by_name.get(wf.get("uniqueName", ""), {})
        wfcd = wfcd_by_name.get(wf.get("uniqueName", ""), {})
        level_stats = de.get("levelStats") or wf.get("levelStats") or []

        # Build enriched drops
        drops = []
        for d in (wf.get("drops") or []):
            total_drops += 1
            location = d.get("location", "")
            drop: dict = {
                "location": location,
                "type": d.get("type", ""),
                "rarity": d.get("rarity", ""),
                "chance": d.get("chance", 0),
            }
            node = nodes_map.get(location.lower())
            if node and node.get("planet"):
                drop["planet"] = node["planet"]
                drop["missionType"] = node["missionType"]
                drop["faction"] = node["faction"]
                drop["levelMin"] = node["levelMin"]
                drop["levelMax"] = node["levelMax"]
                enriched_drops += 1
            drops.append(drop)

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
            "drops": drops,
            "imageName": wf.get("imageName", ""),
            "wikiaThumbnail": wf.get("wikiaThumbnail", ""),
            "tradable": bool(wf.get("tradable", False)),
            # Enriched from warframe-items
            "isAugment": bool(wfcd.get("isAugment", False)),
            "isExilus": bool(wfcd.get("isExilus", False)),
            "isUtility": bool(wfcd.get("isUtility", False)),
            "transmutable": bool(wfcd.get("transmutable", False)),
            "introduced": _get_introduced(wfcd.get("introduced")),
        }
        merged.append(mod)

    if total_drops > 0:
        pct = enriched_drops / total_drops * 100
        print(f"Drop enrichment: {enriched_drops}/{total_drops} drops have planet context ({pct:.0f}%)")

    # Sort alphabetically
    merged.sort(key=lambda m: m["name"])

    write_data_file("mods", merged)
    print(f"Wrote {len(merged)} mods to docs/data/mods.json")

    return {"name": "mods", "count": len(merged), "deAvailable": len(de_by_name) > 0}
