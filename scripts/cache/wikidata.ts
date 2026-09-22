import { fetchText } from "./http";

export type Row = Record<string, string>;

const ENDPOINT = "https://query.wikidata.org/sparql";

/** Run a SPARQL query; returns flat rows of plain string values. */
export async function sparql(query: string, label = "sparql"): Promise<Row[]> {
  const started = Date.now();
  const text = await fetchText(ENDPOINT, {
    method: "POST",
    body: `query=${encodeURIComponent(query)}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
    },
    salt: "v2",
  });
  let parsed: { results: { bindings: Record<string, { value: string }>[] } };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label}: WDQS returned non-JSON (${text.slice(0, 120)})`);
  }
  const rows = parsed.results.bindings.map((b) => {
    const row: Row = {};
    for (const [k, v] of Object.entries(b)) row[k] = v.value;
    return row;
  });
  process.stderr.write(`  ${label}: ${rows.length} rows (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  return rows;
}

/** "Point(lng lat)" → { lat, lng } */
export function parsePoint(wkt: string | undefined): { lat: number; lng: number } | null {
  if (!wkt) return null;
  const m = /Point\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/.exec(wkt);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** QID from an entity URI. */
export function qid(uri: string): string {
  return uri.replace(/^.*\//, "");
}

/** Title from an enwiki article URL, decoded, spaces not underscores. */
export function articleTitle(url: string): string {
  const raw = url.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, "");
  try {
    return decodeURIComponent(raw).replace(/_/g, " ");
  } catch {
    return raw.replace(/_/g, " ");
  }
}

/** Wikidata dates arrive as ISO strings, sometimes with a leading '-' for BCE. */
export function parseWdDate(value: string | undefined): { year: number; iso: string } | null {
  if (!value) return null;
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  if (!Number.isFinite(year)) return null;
  return { year, iso: value };
}

/** Group duplicate rows (one per optional value) by item, keeping the first of each column. */
export function dedupeByItem(rows: Row[], key = "item"): Row[] {
  const seen = new Map<string, Row>();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    const prev = seen.get(id);
    if (!prev) {
      seen.set(id, { ...row });
    } else {
      for (const [k, v] of Object.entries(row)) if (prev[k] === undefined) prev[k] = v;
    }
  }
  return [...seen.values()];
}

export const ENWIKI = `?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .`;
export const LABEL = `SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }`;
/** Coordinates must be on Earth (Q2) — keeps lunar and Martian craters off the globe. */
export const ON_EARTH = `?item p:P625/psv:P625/wikibase:geoGlobe wd:Q2 .`;
/** The item's own image (P18) — the fallback when Wikipedia's lead image is a map. */
export const IMAGE = `OPTIONAL { ?item wdt:P18 ?image . }`;

/** Common shape: instances of a class with coordinates and an English article. */
export function classQuery(opts: {
  classes: string[];
  minSitelinks: number;
  limit: number;
  optional?: string; // extra OPTIONAL clauses; may bind extra vars
  select?: string; // extra select vars, e.g. "?elev ?date"
  filter?: string;
  subclasses?: boolean;
}): string {
  const values = opts.classes.map((c) => `wd:${c}`).join(" ");
  const p31 = opts.subclasses ? "wdt:P31/wdt:P279*" : "wdt:P31";
  return `
SELECT ?item ?itemLabel ?coord ?sl ?article ?image ${opts.select ?? ""} WHERE {
  VALUES ?cls { ${values} }
  ?item ${p31} ?cls ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
  FILTER(?sl >= ${opts.minSitelinks})
  ${ON_EARTH}
  ${opts.filter ?? ""}
  ${opts.optional ?? ""}
  ${IMAGE}
  ${ENWIKI}
  ${LABEL}
} ORDER BY DESC(?sl) LIMIT ${opts.limit}`;
}

/**
 * Sources state the sitelink bar they want for Europe/North America; the
 * query itself runs at half that so pinsFromWikidata can apply a lower bar
 * on under-represented continents (see CONTINENT_FACTOR).
 */
export function relax(minSitelinks: number): number {
  return Math.max(2, Math.round(minSitelinks * 0.5));
}

/** Normalised quantity (SI) via the psn: path. */
export function qty(prop: string, as: string): string {
  return `OPTIONAL { ?item p:${prop}/psn:${prop}/wikibase:quantityAmount ${as} . }`;
}
