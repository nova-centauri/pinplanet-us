import { isPhotoUrl } from "../../../src/imagery";
import { isTightDescription } from "../../../src/otd";
import type { Continent } from "../../../src/types";
import { CREDIT, rankFromSitelinks, type BuildContext, type CachedPin } from "../types";
import { articleTitle, dedupeByItem, parsePoint, type Row } from "../wikidata";
import { commonsThumb, summaries, type WikiSummary } from "../wikipedia";
import { composeFact, sentences, slugify } from "../text";

/**
 * Wikipedia is Europe- and North-America-heavy. A source's sitelink bar
 * applies in full there and is lowered elsewhere so the pool reaches the
 * rest of the planet (the query runs at half the bar; see wikidata.relax).
 */
export const CONTINENT_FACTOR: Record<Continent, number> = {
  europe: 1,
  "north-america": 1,
  asia: 0.85,
  oceania: 0.6,
  africa: 0.5,
  "south-america": 0.5,
  antarctica: 0.3,
};

/** Imageless pins lose this much rank when a cap decides who stays. */
const NO_IMAGE_PENALTY = 0.25;

export interface WdToPinOptions {
  ctx: BuildContext;
  rows: Row[];
  category: string;
  idPrefix: string;
  /** Short structured lead-in ("3,776 m. Last erupted 1707."). Return null for none. */
  hook?: (row: Row, summary: WikiSummary) => string | null;
  year?: (row: Row) => number | undefined;
  flags?: (row: Row) => string[] | undefined;
  cap: number;
  /** Extra rank bonus per row (0..0.3) e.g. eruption recency. */
  bonus?: (row: Row) => number;
  /** Prefer Wikipedia's own coordinates over Wikidata's P625 (e.g. wrecks). */
  preferWikiCoords?: boolean;
  minExtract?: number;
  /** Skip the tight-location description filter (towns are exempt by the plan). */
  exemptFromTightness?: boolean;
  /** Prefer the sentence matching this (e.g. how a ship sank) over filler. */
  focus?: RegExp;
  /** Sitelink bar for Europe/North America; scaled down per continent. */
  minSitelinks?: number;
}

/** Best available photo: Wikipedia's lead image unless it is a map, else Wikidata's P18. */
export function pickImage(summary: WikiSummary | undefined, row?: Row): { url: string; from: "wikipedia" | "wikidata" } | null {
  if (summary?.image && isPhotoUrl(summary.image)) return { url: summary.image, from: "wikipedia" };
  const p18 = row?.image ? commonsThumb(row.image) : null;
  if (p18 && isPhotoUrl(p18)) return { url: p18, from: "wikidata" };
  return null;
}

/**
 * Wikidata rows (item, itemLabel, coord, sl, article, image, …) → pins,
 * enriched with Wikipedia intro text and thumbnails.
 */
export async function pinsFromWikidata(opts: WdToPinOptions): Promise<CachedPin[]> {
  const rows = dedupeByItem(opts.rows).filter((r) => parsePoint(r.coord) && r.article);
  const limited = opts.ctx.limit ? rows.slice(0, opts.ctx.limit) : rows;
  const titles = limited.map((r) => articleTitle(r.article!));
  const wiki = await summaries(titles);

  const pins: CachedPin[] = [];
  let loose = 0;
  let thin = 0;
  const images = { wikipedia: 0, wikidata: 0, none: 0 };
  for (let i = 0; i < limited.length; i++) {
    const row = limited[i]!;
    const summary = wiki.get(titles[i]!);
    if (!summary || summary.missing) continue;
    if (summary.extract.length < (opts.minExtract ?? 60)) continue;
    if (!opts.exemptFromTightness && !isTightDescription(summary.description)) {
      loose += 1;
      continue;
    }
    let point = parsePoint(row.coord)!;
    if (opts.preferWikiCoords && summary.lat !== null && summary.lng !== null) {
      point = { lat: summary.lat, lng: summary.lng };
    }
    const continent = opts.ctx.continentOf(point.lat, point.lng);
    if (opts.minSitelinks && Number(row.sl ?? 0) < opts.minSitelinks * CONTINENT_FACTOR[continent]) {
      thin += 1;
      continue;
    }
    const hook = opts.hook ? opts.hook(row, summary) : null;
    const fact = composeFact(hook, summary.extract, undefined, opts.focus);
    if (!fact || fact.length < 40) continue;
    const rank = Math.min(1, rankFromSitelinks(row.sl) + (opts.bonus ? opts.bonus(row) : 0));
    const pin: CachedPin = {
      id: `${opts.idPrefix}-${slugify(summary.title)}`,
      title: summary.title,
      category: opts.category,
      lat: round(point.lat),
      lng: round(point.lng),
      fact,
      story_url: summary.url,
      story_label: `Wikipedia: ${summary.title}`,
      source: "wikidata",
      added: opts.ctx.today,
      continent,
      credit: CREDIT.wikipedia,
      rank: round(rank, 3),
    };
    const image = pickImage(summary, row);
    if (image) {
      pin.image_url = image.url;
      images[image.from] += 1;
    } else images.none += 1;
    const year = opts.year ? opts.year(row) : undefined;
    if (year !== undefined && Number.isFinite(year)) pin.year = year;
    const flags = opts.flags ? opts.flags(row) : undefined;
    if (flags && flags.length) pin.flags = flags;
    pins.push(pin);
  }
  if (loose) process.stderr.write(`  ${opts.idPrefix}: ${loose} rejected by the tight-location rule\n`);
  if (thin) process.stderr.write(`  ${opts.idPrefix}: ${thin} under the continent sitelink bar\n`);
  process.stderr.write(`  ${opts.idPrefix}: images — ${images.wikipedia} wikipedia, ${images.wikidata} wikidata P18, ${images.none} none (satellite at runtime)\n`);
  pins.sort((a, b) => sortRank(b) - sortRank(a));
  return dedupeById(pins).slice(0, opts.cap);
}

function sortRank(pin: CachedPin): number {
  return (pin.rank ?? 0) - (pin.image_url ? 0 : NO_IMAGE_PENALTY);
}

export interface TitleSpec {
  title: string;
  category: string;
  hook?: string;
  year?: number;
  rank?: number;
}

/** Hand-picked Wikipedia titles → pins (coordinates come from the article). */
export async function pinsFromTitles(
  ctx: BuildContext,
  specs: TitleSpec[],
  idPrefix: string,
): Promise<CachedPin[]> {
  const limited = ctx.limit ? specs.slice(0, ctx.limit) : specs;
  const wiki = await summaries(limited.map((s) => s.title));
  const pins: CachedPin[] = [];
  const missing: string[] = [];
  let noImage = 0;
  for (const spec of limited) {
    const summary = wiki.get(spec.title);
    if (!summary || summary.missing || summary.lat === null || summary.lng === null) {
      missing.push(spec.title);
      continue;
    }
    if (summary.extract.length < 60) {
      missing.push(`${spec.title} (no extract)`);
      continue;
    }
    const fact = composeFact(spec.hook ?? null, summary.extract);
    const pin: CachedPin = {
      id: `${idPrefix}-${slugify(summary.title)}`,
      title: summary.title,
      category: spec.category,
      lat: round(summary.lat),
      lng: round(summary.lng),
      fact,
      story_url: summary.url,
      story_label: `Wikipedia: ${summary.title}`,
      source: "wikipedia",
      added: ctx.today,
      continent: ctx.continentOf(summary.lat, summary.lng),
      credit: CREDIT.wikipedia,
      rank: spec.rank ?? 0.72,
    };
    const image = pickImage(summary);
    if (image) pin.image_url = image.url;
    else noImage += 1;
    if (spec.year !== undefined) pin.year = spec.year;
    pins.push(pin);
  }
  if (missing.length) {
    process.stderr.write(`  ${idPrefix}: ${missing.length} titles skipped (no coords/extract): ${missing.slice(0, 12).join("; ")}${missing.length > 12 ? " …" : ""}\n`);
  }
  if (noImage) process.stderr.write(`  ${idPrefix}: ${noImage} titles without a usable photo (satellite at runtime)\n`);
  return dedupeById(pins);
}

export function dedupeById(pins: CachedPin[]): CachedPin[] {
  const seen = new Set<string>();
  return pins.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** True when the intro's first sentence already carries this token (year, number). */
export function firstSentenceMentions(summary: WikiSummary, token: string | number | undefined | null): boolean {
  if (token === undefined || token === null) return false;
  const first = sentences(summary.extract)[0] ?? "";
  return first.includes(String(token));
}

export function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
