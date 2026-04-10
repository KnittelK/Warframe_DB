"""Fetch and merge Warframe mod data.

Sources:
- warframe-items CDN  (primary — all mod fields, auto-updated by WFCD on every DE patch)
- warframestat.us/mods (secondary — used only to enrich drop rarity, which warframe-items omits)
- warframestat.us/nodes (optional — planet/mission context for drop locations)
"""

import re

from lib.fetch import fetch_json, fetch_json_optional
from lib.writers import write_data_file

WFCD_MODS_URL = "https://cdn.jsdelivr.net/npm/@wfcd/items@latest/data/json/Mods.json"
WARFRAMESTAT_MODS_URL = "https://api.warframestat.us/mods"
WARFRAMESTAT_NODES_URL = "https://api.warframestat.us/nodes"


def _normalize_type(raw: str | None) -> str:
    if not raw:
        return "Unknown"
    s = re.sub(r" Mod$", "", raw, flags=re.IGNORECASE).strip()
    return s[0].upper() + s[1:] if s else "Unknown"


def _extract_stat_types(level_stats: list) -> list:
    """Fallback stat-type extractor used when warframe-items omits statTypes."""
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


def _build_drop_rarity_map(wfstat_mods: list | None) -> dict:
    """Build uniqueName → {location_lower: rarity} from warframestat.us mods.

    warframe-items drops omit rarity; this map patches it in afterwards.
    Only the first rarity seen per location is kept (duplicates are same-rarity rotations).
    """
    rarity_map: dict = {}
    if not isinstance(wfstat_mods, list):
        return rarity_map
    for mod in wfstat_mods:
        un = mod.get("uniqueName", "")
        if not un:
            continue
        by_loc: dict = {}
        for drop in mod.get("drops") or []:
            loc = drop.get("location", "").lower()
            rarity = drop.get("rarity", "")
            if loc and rarity and loc not in by_loc:
                by_loc[loc] = rarity
        if by_loc:
            rarity_map[un] = by_loc
    return rarity_map


def _build_nodes_map(nodes_raw: dict | list | None) -> dict:
    """Build display-name-lower → {planet, missionType, faction, levelMin, levelMax}.

    warframestat.us /nodes returns a dict keyed by internal path; each node has
    'value' (display name), 'systemName' (planet), 'type' (mission type), etc.
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


def _get_introduced(introduced) -> str:
    if not introduced:
        return ""
    if isinstance(introduced, dict):
        return introduced.get("name") or introduced.get("version") or ""
    return str(introduced)


def run() -> dict:
    """Fetch, merge, and write docs/data/mods.json."""
    wfcd_mods = fetch_json(WFCD_MODS_URL, "warframe-items")
    wfstat_mods = fetch_json_optional(WARFRAMESTAT_MODS_URL, "warframestat.us/mods")
    nodes_raw = fetch_json_optional(WARFRAMESTAT_NODES_URL, "warframestat.us/nodes")

    rarity_map = _build_drop_rarity_map(wfstat_mods)
    nodes_map = _build_nodes_map(nodes_raw)

    print(f"warframe-items: {len(wfcd_mods)} mods")
    print(f"warframestat.us drop rarity: {len(rarity_map)} mods with rarity data")
    print(f"Nodes map: {len(nodes_map)} nodes indexed")

    enriched_drops = 0
    total_drops = 0
    merged = []

    for item in wfcd_mods:
        if not item.get("name"):
            continue

        un = item.get("uniqueName", "")
        level_stats = item.get("levelStats") or []
        mod_rarity_by_loc = rarity_map.get(un, {})

        drops = []
        for d in item.get("drops") or []:
            total_drops += 1
            location = d.get("location", "")
            drop: dict = {
                "location": location,
                "type": d.get("type", ""),
                "rarity": mod_rarity_by_loc.get(location.lower(), ""),
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

        merged.append({
            "name": item["name"],
            "uniqueName": un,
            "type": _normalize_type(item.get("type")),
            "compatName": (item.get("compatName") or "").upper(),
            "rarity": item.get("rarity") or "Common",
            "polarity": item.get("polarity") or "",
            "baseDrain": item.get("baseDrain", 0),
            "fusionLimit": item.get("fusionLimit", 0),
            "description": item.get("description", ""),
            "levelStats": level_stats,
            # warframe-items pre-computes statTypes; fall back to regex extraction
            "statTypes": item.get("statTypes") or _extract_stat_types(level_stats),
            "drops": drops,
            "imageName": item.get("imageName", ""),
            "wikiaThumbnail": item.get("wikiaThumbnail", ""),
            "tradable": bool(item.get("tradable", False)),
            "isAugment": bool(item.get("isAugment", False)),
            "isExilus": bool(item.get("isExilus", False)),
            "isUtility": bool(item.get("isUtility", False)),
            "transmutable": bool(item.get("transmutable", False)),
            "introduced": _get_introduced(item.get("introduced")),
        })

    if total_drops > 0:
        pct = enriched_drops / total_drops * 100
        print(
            f"Drop enrichment: {enriched_drops}/{total_drops} drops "
            f"have planet context ({pct:.0f}%)"
        )

    merged.sort(key=lambda m: m["name"])
    write_data_file("mods", merged)
    print(f"Wrote {len(merged)} mods to docs/data/mods.json")

    return {"name": "mods", "count": len(merged), "deAvailable": True}
