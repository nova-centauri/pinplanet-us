import { isTightDescription } from "../../../src/otd";
import { CREDIT, rankFromSitelinks, type BuildContext, type CachedPin } from "../types";
import { articleTitle, dedupeByItem, parsePoint, type Row } from "../wikidata";
import { summaries, type WikiSummary } from "../wikipedia";
import { composeFact, sentences, slugify } from "../text";

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
}

/**
 * Wikidata rows (item, itemLabel, coord, sl, article, …) → pins, enriched
 * with Wikipedia intro text and thumbnails.
 */
export async function pinsFromWikidata(opts: WdToPinOptions): Promise<CachedPin[]> {
  const rows = dedupeByItem(opts.rows).filter((r) => parsePoint(r.coord) && r.article);
  const limited = opts.ctx.limit ? rows.slice(0, opts.ctx.limit) : rows;
  const titles = limited.map((r) => articleTitle(r.article!));
  const wiki = await summaries(titles);

  const pins: CachedPin[] = [];
  let loose = 0;
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
      continent: opts.ctx.continentOf(point.lat, point.lng),
      credit: CREDIT.wikipedia,
      rank: round(rank, 3),
    };
    if (summary.image) pin.image_url = summary.image;
    const year = opts.year ? opts.year(row) : undefined;
    if (year !== undefined && Number.isFinite(year)) pin.year = year;
    const flags = opts.flags ? opts.flags(row) : undefined;
    if (flags && flags.length) pin.flags = flags;
    pins.push(pin);
  }
  if (loose) process.stderr.write(`  ${opts.idPrefix}: ${loose} rejected by the tight-location rule\n`);
  pins.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  return dedupeById(pins).slice(0, opts.cap);
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
    if (summary.image) pin.image_url = summary.image;
    if (spec.year !== undefined) pin.year = spec.year;
    pins.push(pin);
  }
  if (missing.length) {
    process.stderr.write(`  ${idPrefix}: ${missing.length} titles skipped (no coords/extract): ${missing.slice(0, 12).join("; ")}${missing.length > 12 ? " …" : ""}\n`);
  }
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
