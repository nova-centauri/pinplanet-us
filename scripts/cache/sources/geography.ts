import type { BuildContext, CachedPin } from "../types";
import { classQuery, ENWIKI, LABEL, ON_EARTH, parseWdDate, qty, sparql, type Row } from "../wikidata";
import { fmtInt, fmtNum } from "../text";
import { firstSentenceMentions, num, pinsFromWikidata } from "./common";

/** Peaks: everything above 6,000 m plus the highest point of every country. */
export async function buildPeaks(ctx: BuildContext): Promise<CachedPin[]> {
  const tall = await sparql(
    classQuery({
      classes: ["Q8502", "Q8072"],
      minSitelinks: 8,
      limit: 400,
      select: "?elev",
      optional: qty("P2044", "?elev"),
      filter: `?item p:P2044/psn:P2044/wikibase:quantityAmount ?e0 . FILTER(?e0 >= 6000)`,
    }),
    "peaks ≥ 6000 m",
  );
  const national = await sparql(
    `SELECT ?item ?itemLabel ?coord ?sl ?article ?elev ?countryLabel WHERE {
      ?country wdt:P31 wd:Q6256 ; wdt:P610 ?item .
      ?item wdt:P625 ?coord ; wikibase:sitelinks ?sl .
      ${ON_EARTH}
      ${qty("P2044", "?elev")}
      ${ENWIKI}
      ${LABEL}
    } ORDER BY DESC(?sl) LIMIT 400`,
    "national high points",
  );
  const rows: Row[] = [...national.map((r) => ({ ...r, national: "1" })), ...tall];
  return pinsFromWikidata({
    ctx,
    rows,
    category: "geography",
    idPrefix: "peak",
    cap: 230,
    hook: (row, summary) => {
      const elev = num(row.elev);
      const parts: string[] = [];
      if (row.national === "1" && row.countryLabel && !/^Q\d+$/.test(row.countryLabel)) parts.push(`Highest point of ${row.countryLabel}`);
      if (elev !== undefined && elev > 0 && !firstSentenceMentions(summary, fmtInt(elev))) parts.push(`${fmtInt(elev)} m above sea level`);
      return parts.length ? `${parts.join(": ")}.` : null;
    },
    bonus: (row) => {
      const elev = num(row.elev) ?? 0;
      return elev >= 8000 ? 0.25 : elev >= 7000 ? 0.12 : row.national === "1" ? 0.08 : 0;
    },
  });
}

interface FeatureClass {
  qids: string[];
  label: string;
  min: number;
  limit: number;
  cap: number;
  extra?: string; // OPTIONAL clauses
  select?: string;
  hook?: (row: Row) => string | null;
}

const FEATURES: FeatureClass[] = [
  {
    qids: ["Q34038"],
    label: "waterfalls",
    min: 12,
    limit: 250,
    cap: 60,
    select: "?height",
    extra: qty("P2048", "?height"),
    hook: (r) => {
      const h = num(r.height);
      return h && h > 0 ? `Waterfall, ${fmtInt(h)} m tall.` : "Waterfall.";
    },
  },
  {
    qids: ["Q35509", "Q1317637"],
    label: "caves",
    min: 12,
    limit: 250,
    cap: 55,
    select: "?length ?depth",
    extra: `${qty("P2043", "?length")} ${qty("P4511", "?depth")}`,
    hook: (r) => {
      const len = num(r.length);
      const depth = num(r.depth);
      const bits: string[] = [];
      if (len && len > 0) bits.push(`${fmtNum(len / 1000)} km of passages`);
      if (depth && depth > 0) bits.push(`${fmtInt(depth)} m deep`);
      return bits.length ? `Cave: ${bits.join(", ")}.` : "Cave.";
    },
  },
  {
    qids: ["Q23397"],
    label: "lakes",
    min: 40,
    limit: 250,
    cap: 50,
    select: "?area ?depth",
    extra: `${qty("P2046", "?area")} ${qty("P4511", "?depth")}`,
    hook: (r) => {
      const area = num(r.area);
      const depth = num(r.depth);
      const bits: string[] = [];
      if (area && area > 0) bits.push(`${fmtInt(area / 1e6)} km²`);
      if (depth && depth > 0) bits.push(`${fmtInt(depth)} m deep`);
      return bits.length ? `Lake, ${bits.join(", ")}.` : null;
    },
  },
  { qids: ["Q8514"], label: "deserts", min: 20, limit: 150, cap: 30, hook: () => null },
  {
    qids: ["Q150784"],
    label: "canyons",
    min: 12,
    limit: 200,
    cap: 40,
    select: "?depth ?length",
    extra: `${qty("P4511", "?depth")} ${qty("P2043", "?length")}`,
    hook: (r) => {
      const depth = num(r.depth);
      const len = num(r.length);
      const bits: string[] = [];
      if (depth && depth > 0) bits.push(`${fmtInt(depth)} m deep`);
      if (len && len > 0) bits.push(`${fmtNum(len / 1000)} km long`);
      return bits.length ? `Canyon, ${bits.join(", ")}.` : null;
    },
  },
  {
    qids: ["Q35666"],
    label: "glaciers",
    min: 15,
    limit: 200,
    cap: 40,
    select: "?area ?length",
    extra: `${qty("P2046", "?area")} ${qty("P2043", "?length")}`,
    hook: (r) => {
      const area = num(r.area);
      const len = num(r.length);
      const bits: string[] = [];
      if (len && len > 0) bits.push(`${fmtNum(len / 1000)} km long`);
      if (area && area > 0) bits.push(`${fmtInt(area / 1e6)} km²`);
      return bits.length ? `Glacier, ${bits.join(", ")}.` : null;
    },
  },
  { qids: ["Q83471", "Q177380"], label: "geysers & hot springs", min: 8, limit: 200, cap: 40, hook: () => null },
  { qids: ["Q188734", "Q334743", "Q7180402"], label: "sinkholes, cenotes & blue holes", min: 6, limit: 150, cap: 30, hook: () => null },
  { qids: ["Q45776", "Q42523"], label: "fjords & atolls", min: 15, limit: 200, cap: 35, hook: () => null },
  { qids: ["Q25391", "Q631305"], label: "dunes & rock formations", min: 12, limit: 250, cap: 45, hook: () => null },
];

/** Natural wonders by class, each capped so no single class floods the pool. */
export async function buildFeatures(ctx: BuildContext): Promise<CachedPin[]> {
  const out: CachedPin[] = [];
  for (const f of FEATURES) {
    const rows = await sparql(
      classQuery({ classes: f.qids, minSitelinks: f.min, limit: f.limit, select: f.select, optional: f.extra }),
      f.label,
    );
    const pins = await pinsFromWikidata({
      ctx,
      rows,
      category: "geography",
      idPrefix: "geo",
      cap: f.cap,
      hook: (row, summary) => {
        const h = f.hook ? f.hook(row) : null;
        if (!h) return null;
        // Skip the hook when the intro already leads with the same number.
        const firstNumber = /[\d,.]+/.exec(h)?.[0];
        if (firstNumber && firstSentenceMentions(summary, firstNumber)) return null;
        return h;
      },
    });
    out.push(...pins);
  }
  return out;
}

/** UNESCO World Heritage Sites (via the WHS ID property), most-linked first. */
export async function buildHeritage(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    `SELECT ?item ?itemLabel ?coord ?sl ?article ?since WHERE {
      ?item wdt:P757 ?whs ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
      FILTER(?sl >= 22)
      ${ON_EARTH}
      OPTIONAL { ?item p:P1435 ?st . ?st ps:P1435 wd:Q9259 . ?st pq:P580 ?since . }
      ${ENWIKI}
      ${LABEL}
    } ORDER BY DESC(?sl) LIMIT 700`,
    "world heritage",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "site",
    idPrefix: "unesco",
    cap: 260,
    hook: (row) => {
      const year = parseWdDate(row.since)?.year;
      return year ? `UNESCO World Heritage Site since ${year}.` : "UNESCO World Heritage Site.";
    },
  });
}
