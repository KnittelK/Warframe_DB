#!/usr/bin/env node
/**
 * Merges Warframe mod data from two sources:
 * 1. DE's Public Export (ExportUpgrades) — canonical stats
 * 2. warframestat.us — drop tables, images, descriptions
 *
 * Outputs site/data/mods.json
 */

const fs = require("fs");
const path = require("path");

const DE_EXPORT_URL =
  "https://content.warframe.com/PublicExport/Manifest/ExportUpgrades.json";
const WARFRAMESTAT_URL = "https://api.warframestat.us/mods";

const OUT_PATH = path.join(__dirname, "..", "docs", "data", "mods.json");

async function fetchJSON(url, label) {
  console.log(`Fetching ${label}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  let text = await res.text();
  // DE exports start with a UTF-8 BOM — strip it
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function normalizeType(raw) {
  if (!raw) return "Unknown";
  const s = raw.replace(/ Mod$/i, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractStatTypes(levelStats) {
  const types = new Set();
  if (!Array.isArray(levelStats)) return [];
  for (const level of levelStats) {
    const entries = level.stats || level;
    if (!Array.isArray(entries)) continue;
    for (const stat of entries) {
      // Match patterns like "+15% Damage" or "-10% Recoil" or "+1.2 Energy/sec"
      const m = String(stat).match(
        /^[+\-]?[\d.]+[%]?\s+(.+?)(?:\s+(?:for|on|while|per|at)\b.*)?$/i,
      );
      if (m) types.add(m[1].trim());
    }
  }
  return [...types];
}

async function main() {
  // Fetch both sources concurrently
  const [deRaw, wfMods] = await Promise.all([
    fetchJSON(DE_EXPORT_URL, "DE Public Export").catch((err) => {
      console.warn(
        "DE export unavailable, continuing with warframestat only:",
        err.message,
      );
      return null;
    }),
    fetchJSON(WARFRAMESTAT_URL, "warframestat.us"),
  ]);

  // Index DE data by uniqueName
  const deByName = new Map();
  if (deRaw) {
    const deUpgrades = deRaw.ExportUpgrades || deRaw;
    const list = Array.isArray(deUpgrades) ? deUpgrades : [];
    for (const mod of list) {
      if (mod.uniqueName) deByName.set(mod.uniqueName, mod);
    }
    console.log(`DE export: ${deByName.size} upgrades indexed`);
  }

  console.log(`warframestat.us: ${wfMods.length} mods fetched`);

  const merged = [];

  for (const wf of wfMods) {
    // Skip mods with no name or marked as codex-secret
    if (!wf.name) continue;

    const de = deByName.get(wf.uniqueName) || {};

    // Prefer DE stats when available (more up-to-date), fall back to warframestat
    const levelStats = de.levelStats || wf.levelStats || [];

    const mod = {
      name: wf.name,
      uniqueName: wf.uniqueName || "",
      type: normalizeType(wf.type),
      compatName: (de.compatName || wf.compatName || "").toUpperCase(),
      rarity: wf.rarity || de.rarity || "Common",
      polarity: wf.polarity || de.polarity || "",
      baseDrain: de.baseDrain ?? wf.baseDrain ?? 0,
      fusionLimit: de.fusionLimit ?? wf.fusionLimit ?? 0,
      description: wf.description || "",
      levelStats: levelStats,
      statTypes: extractStatTypes(levelStats),
      drops: (wf.drops || []).map((d) => ({
        location: d.location || "",
        type: d.type || "",
        chance: d.chance || 0,
      })),
      imageName: wf.imageName || "",
      wikiaThumbnail: wf.wikiaThumbnail || "",
      tradable: wf.tradable ?? false,
    };

    merged.push(mod);
  }

  // Sort alphabetically
  merged.sort((a, b) => a.name.localeCompare(b.name));

  // Write output
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(merged));

  console.log(`Wrote ${merged.length} mods to ${OUT_PATH}`);

  // Also write a small metadata file
  const meta = {
    lastUpdated: new Date().toISOString(),
    modCount: merged.length,
    deAvailable: deByName.size > 0,
  };
  fs.writeFileSync(
    path.join(path.dirname(OUT_PATH), "meta.json"),
    JSON.stringify(meta, null, 2),
  );
  console.log("Wrote meta.json");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
