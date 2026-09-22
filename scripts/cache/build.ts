import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { continentOf, loadContinents } from "./continent";
import { httpStats, setFresh } from "./http";
import { FACT_MAX } from "./text";
import type { BuildContext, CachedPin, SourceBuilder } from "./types";
import { sparql } from "./wikidata";
import { buildCurated } from "./sources/curated";
import { buildFossils } from "./sources/fossils";
import { buildFeatures, buildHeritage, buildPeaks } from "./sources/geography";
import {
  buildAncient,
  buildBattles,
  buildCraters,
  buildDisasters,
  buildGhostTowns,
  buildMeteorites,
  buildQuakes,
  buildScience,
  buildShipwrecks,
} from "./sources/history";
import { buildStructures } from "./sources/structures";
import { buildOnThisDay } from "./sources/onThisDay";
import { buildVolcanoes } from "./sources/volcanoes";

/**
 * PinPlanet cache builder.
 *
 *   npm run cache:build                 # full build (≈10 min cold, seconds warm)
 *   npm run cache:build -- --only=volcanoes,battles
 *   npm run cache:build -- --limit=20   # dev: a few rows per source
 *   npm run cache:build -- --fresh      # ignore the on-disk HTTP cache
 *
 * Output: public/data/pins.json (one pin per line) + public/data/pins.meta.json
 */

// Priority order: when two sources describe the same article, the earlier wins.
const SOURCES: [string, SourceBuilder][] = [
  ["curated", buildCurated],
  ["volcanoes", buildVolcanoes],
  ["battles", buildBattles],
  ["craters", buildCraters],
  ["meteorites", buildMeteorites],
  ["fossils", buildFossils],
  ["quakes", buildQuakes],
  ["disasters", buildDisasters],
  ["shipwrecks", buildShipwrecks],
  ["science", buildScience],
  ["ancient", buildAncient],
  ["peaks", buildPeaks],
  ["features", buildFeatures],
  ["heritage", buildHeritage],
  ["structures", buildStructures],
  ["ghost-towns", buildGhostTowns],
  ["on-this-day", buildOnThisDay],
];

const CLASS_CHECK: Record<string, string> = {
  Q178561: "battle",
  Q188055: "siege",
  Q1261499: "naval battle",
  Q55818: "impact crater",
  Q60186: "meteorite",
  Q852190: "shipwreck",
  Q7944: "earthquake",
  Q74047: "ghost town",
  Q194188: "spaceport",
  Q62832: "observatory",
  Q749622: "Antarctic research station",
  Q130825: "particle accelerator",
  Q1620824: "nuclear accident",
  Q839954: "archaeological site",
  Q15661340: "ancient city",
  Q12516: "pyramid",
  Q164240: "megalith",
  Q1935728: "stone circle",
  Q54831: "amphitheatre",
  Q2122699: "lagerstätte",
  Q9096832: "paleontological site",
  Q8502: "mountain",
  Q8072: "volcano",
  Q34038: "waterfall",
  Q35509: "cave",
  Q1317637: "ice cave",
  Q23397: "lake",
  Q8514: "desert",
  Q150784: "canyon",
  Q35666: "glacier",
  Q83471: "geyser",
  Q177380: "hot spring",
  Q188734: "doline",
  Q334743: "cenote",
  Q7180402: "blue hole",
  Q45776: "fjord",
  Q42523: "atoll",
  Q25391: "dune",
  Q631305: "rock formation",
  Q9259: "World Heritage Site",
  Q6256: "country",
  Q23442: "island",
  Q46169: "national park",
  Q184358: "reef",
  Q124714: "spring",
  Q40080: "beach",
  Q39816: "valley",
  Q4421: "forest",
  Q8070: "tsunami",
  Q7692360: "volcanic eruption",
  Q8068: "flood",
  Q7935: "avalanche",
  Q167903: "landslide",
  Q169950: "wildfire",
  Q8081: "tornado",
  Q184356: "radio telescope",
  Q134447: "nuclear power plant",
  Q23413: "castle",
  Q17715832: "castle ruin",
  Q57821: "fortification",
  Q1785071: "fort",
  Q16560: "palace",
  Q2977: "cathedral",
  Q32815: "mosque",
  Q44539: "temple",
  Q842402: "Hindu temple",
  Q44613: "monastery",
  Q39715: "lighthouse",
  Q12280: "bridge",
  Q12323: "dam",
  Q11303: "skyscraper",
  Q12518: "tower",
  Q179700: "statue",
  Q44377: "tunnel",
  Q474: "aqueduct",
  Q820477: "mine",
  Q40357: "prison",
};

interface Args {
  only: Set<string> | null;
  limit: number | null;
  fresh: boolean;
  skipCheck: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { only: null, limit: null, fresh: false, skipCheck: false };
  for (const a of argv) {
    if (a.startsWith("--only=")) args.only = new Set(a.slice(7).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith("--limit=")) args.limit = Math.max(1, Number(a.slice(8)) || 10);
    else if (a === "--fresh") args.fresh = true;
    else if (a === "--skip-check") args.skipCheck = true;
  }
  return args;
}

async function verifyClasses(): Promise<void> {
  const ids = Object.keys(CLASS_CHECK);
  const rows = await sparql(
    `SELECT ?item ?itemLabel WHERE { VALUES ?item { ${ids.map((q) => `wd:${q}`).join(" ")} } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`,
    "class check",
  );
  const labels = new Map(rows.map((r) => [r.item!.replace(/^.*\//, ""), r.itemLabel ?? ""]));
  let bad = 0;
  for (const [q, expected] of Object.entries(CLASS_CHECK)) {
    const got = labels.get(q) ?? "(missing)";
    const ok = got.toLowerCase().includes(expected.toLowerCase().split(" ")[0]!);
    if (!ok) bad += 1;
    process.stderr.write(`  ${ok ? "✓" : "✗"} ${q} = "${got}" (expected ~ ${expected})\n`);
  }
  if (bad) throw new Error(`${bad} Wikidata class IDs look wrong; fix CLASS_CHECK / queries before building.`);
}

function km(a: CachedPin, b: CachedPin): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normUrl(url: string): string {
  try {
    return decodeURIComponent(url).toLowerCase().replace(/^https?:\/\/(en\.)?/, "").replace(/#.*$/, "");
  } catch {
    return url.toLowerCase();
  }
}

/**
 * How close two same-category pins may be before the lower-priority one is
 * dropped as a duplicate. Wide for things that are one event or one crater
 * under two names; tight for built things, where a city holds a dozen
 * distinct sites within a kilometre of each other.
 */
const NEAR_KM: Record<string, number> = {
  impact: 20,
  earthquake: 20,
  "natural disaster": 20,
  volcano: 8,
  fossil: 8,
  battle: 5,
  geography: 3,
  shipwreck: 3,
  site: 0.4,
  ancient: 0.6,
  science: 0.4,
  historical: 0.4,
  "random place": 1,
  "world record": 0.4,
};
const NEAR_KM_DEFAULT = 2;

/** Pool rules: one pin per article; same-category pins closer than NEAR_KM merge. */
function merge(groups: Map<string, CachedPin[]>, seedUrls: Set<string>): { pins: CachedPin[]; dropped: Record<string, number> } {
  const byUrl = new Map<string, CachedPin>();
  const byId = new Set<string>();
  const dropped: Record<string, number> = {};
  const out: CachedPin[] = [];
  const bump = (k: string) => (dropped[k] = (dropped[k] ?? 0) + 1);

  for (const [source, pins] of groups) {
    for (const pin of pins) {
      const url = normUrl(pin.story_url);
      if (seedUrls.has(url)) {
        bump(`${source}:seed-dup`);
        continue;
      }
      const prev = byUrl.get(url);
      if (prev) {
        // Keep the higher-priority pin but inherit the day tag so "today in history" still lights up.
        if (pin.day && !prev.day) {
          prev.day = pin.day;
          if (pin.year !== undefined && prev.year === undefined) prev.year = pin.year;
        }
        bump(`${source}:url-dup`);
        continue;
      }
      if (byId.has(pin.id)) {
        bump(`${source}:id-dup`);
        continue;
      }
      byUrl.set(url, pin);
      byId.add(pin.id);
      out.push(pin);
    }
  }

  // Proximity merge within a category (cheap grid bucketing).
  const kept: CachedPin[] = [];
  const grid = new Map<string, CachedPin[]>();
  const key = (p: CachedPin, dx = 0, dy = 0) => `${p.category}|${Math.floor(p.lat / 0.25) + dy}|${Math.floor(p.lng / 0.25) + dx}`;
  for (const pin of out) {
    let clash = false;
    for (let dx = -1; dx <= 1 && !clash; dx++) {
      for (let dy = -1; dy <= 1 && !clash; dy++) {
        for (const other of grid.get(key(pin, dx, dy)) ?? []) {
          if (km(pin, other) < (NEAR_KM[pin.category] ?? NEAR_KM_DEFAULT)) {
            clash = true;
            break;
          }
        }
      }
    }
    if (clash) {
      bump(`${pin.source}:near-dup`);
      continue;
    }
    const k = key(pin);
    const bucket = grid.get(k);
    if (bucket) bucket.push(pin);
    else grid.set(k, [pin]);
    kept.push(pin);
  }
  return { pins: kept, dropped };
}

function validate(pins: CachedPin[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of pins) {
    if (!p.id || ids.has(p.id)) problems.push(`duplicate/missing id: ${p.id}`);
    ids.add(p.id);
    if (!p.title) problems.push(`${p.id}: no title`);
    if (!p.fact || p.fact.length > FACT_MAX) problems.push(`${p.id}: fact length ${p.fact?.length ?? 0}`);
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
      problems.push(`${p.id}: bad coordinates`);
    if (!/^https:\/\//.test(p.story_url)) problems.push(`${p.id}: story_url not https`);
    if (!p.continent) problems.push(`${p.id}: no continent`);
    if (p.image_url && !/^https:\/\//.test(p.image_url)) problems.push(`${p.id}: image_url not https`);
  }
  return problems;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  setFresh(args.fresh);
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  process.stderr.write(`PinPlanet cache build — ${today}${args.limit ? ` (dev limit ${args.limit})` : ""}\n`);

  await loadContinents();
  if (!args.skipCheck) await verifyClasses();

  const ctx: BuildContext = { today, continentOf, limit: args.limit };
  const groups = new Map<string, CachedPin[]>();
  const timings: Record<string, number> = {};
  for (const [name, build] of SOURCES) {
    if (args.only && !args.only.has(name)) continue;
    process.stderr.write(`\n▶ ${name}\n`);
    const t0 = Date.now();
    try {
      const pins = await build(ctx);
      groups.set(name, pins);
      timings[name] = Math.round((Date.now() - t0) / 1000);
      process.stderr.write(`  ${name}: ${pins.length} pins in ${timings[name]}s\n`);
    } catch (err) {
      process.stderr.write(`  ${name}: FAILED — ${(err as Error).stack ?? err}\n`);
      groups.set(name, []);
    }
  }

  const seeds = JSON.parse(readFileSync(join(process.cwd(), "data", "seed-pins.json"), "utf8")) as { story_url: string }[];
  const seedUrls = new Set(seeds.map((s) => normUrl(s.story_url)));
  const { pins, dropped } = merge(groups, seedUrls);

  const problems = validate(pins);
  if (problems.length) {
    process.stderr.write(`\n${problems.length} validation problems:\n  ${problems.slice(0, 30).join("\n  ")}\n`);
    throw new Error("cache validation failed");
  }

  pins.sort((a, b) => a.category.localeCompare(b.category) || (b.rank ?? 0) - (a.rank ?? 0) || a.id.localeCompare(b.id));

  // Two files: a core the browser needs before the tour is "full", and the
  // rest, fetched after the first landing. Core = round-robin across
  // categories by rank so every category is represented from the start.
  const { core, extra } = splitCore(pins, CORE_SIZE);

  const outDir = join(process.cwd(), "public", "data");
  mkdirSync(outDir, { recursive: true });
  const encode = (list: CachedPin[]) => `[\n${list.map((p) => JSON.stringify(p)).join(",\n")}\n]\n`;
  const body = encode(core);
  const bodyExtra = encode(extra);
  if (args.only || args.limit) {
    const dev = join(outDir, "pins.dev.json");
    writeFileSync(dev, encode(pins));
    process.stderr.write(`\n(dev run) wrote ${pins.length} pins → ${dev}\n`);
  } else {
    writeFileSync(join(outDir, "pins.json"), body);
    writeFileSync(join(outDir, "pins-extra.json"), bodyExtra);
  }

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byContinent: Record<string, number> = {};
  let withImage = 0;
  for (const p of pins) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    bySource[p.source] = (bySource[p.source] ?? 0) + 1;
    byContinent[p.continent] = (byContinent[p.continent] ?? 0) + 1;
    if (p.image_url) withImage += 1;
  }
  const meta = {
    built: new Date().toISOString(),
    total: pins.length,
    core: core.length,
    extra: extra.length,
    withImage,
    bytes: Buffer.byteLength(body),
    bytesExtra: Buffer.byteLength(bodyExtra),
    byCategory,
    bySource,
    byContinent,
    perBuilder: Object.fromEntries([...groups].map(([k, v]) => [k, v.length])),
    dropped,
    timingsSeconds: timings,
    http: httpStats(),
  };
  if (!(args.only || args.limit)) writeFileSync(join(outDir, "pins.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  process.stderr.write(`\n${JSON.stringify(meta, null, 2)}\n`);
  process.stderr.write(
    `\nDone: ${pins.length} pins (core ${core.length} = ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB, extra ${extra.length} = ${(Buffer.byteLength(bodyExtra) / 1024).toFixed(0)} KB), ${((Date.now() - started) / 1000).toFixed(0)}s\n`,
  );
}

const CORE_SIZE = 1400;

function splitCore(pins: CachedPin[], size: number): { core: CachedPin[]; extra: CachedPin[] } {
  const byCategory = new Map<string, CachedPin[]>();
  for (const p of pins) {
    const list = byCategory.get(p.category);
    if (list) list.push(p);
    else byCategory.set(p.category, [p]);
  }
  for (const list of byCategory.values()) list.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  const chosen = new Set<string>();
  const queues = [...byCategory.values()];
  let progress = true;
  while (chosen.size < size && progress) {
    progress = false;
    for (const q of queues) {
      if (chosen.size >= size) break;
      const next = q.shift();
      if (next) {
        chosen.add(next.id);
        progress = true;
      }
    }
  }
  return { core: pins.filter((p) => chosen.has(p.id)), extra: pins.filter((p) => !chosen.has(p.id)) };
}

main().catch((err) => {
  process.stderr.write(`\nBuild failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
