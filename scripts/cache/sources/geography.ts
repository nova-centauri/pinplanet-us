import type { BuildContext, CachedPin } from "../types";
import { classQuery, ENWIKI, IMAGE, LABEL, ON_EARTH, parseWdDate, qty, relax, sparql, type Row } from "../wikidata";
import { fmtInt, fmtNum } from "../text";
import { firstSentenceMentions, num, pinsFromWikidata } from "./common";

/**
 * Peaks: everything above 6,000 m, the ultra-prominent peaks (≥ 1,800 m of
 * prominence — the ones that dominate their skyline), and the highest point
 * of every country.
 */
export async function buildPeaks(ctx: BuildContext): Promise<CachedPin[]> {
  const tall = await sparql(
    classQuery({
      classes: ["Q8502", "Q8072"],
      minSitelinks: 4,
      limit: 500,
      select: "?elev",
      optional: qty("P2044", "?elev"),
      filter: `?item p:P2044/psn:P2044/wikibase:quantityAmount ?e0 . FILTER(?e0 >= 6000)`,
    }),
    "peaks ≥ 6000 m",
  );
  const prominent = await sparql(
    classQuery({
      classes: ["Q8502", "Q8072"],
      minSitelinks: relax(14),
      limit: 800,
      select: "?elev ?prom",
      optional: `${qty("P2044", "?elev")} ${qty("P2660", "?prom")}`,
      filter: `?item p:P2660/psn:P2660/wikibase:quantityAmount ?p0 . FILTER(?p0 >= 1800)`,
    }),
    "ultra-prominent peaks",
  );
  const national = await sparql(
    `SELECT ?item ?itemLabel ?coord ?sl ?article ?image ?elev ?countryLabel WHERE {
      ?country wdt:P31 wd:Q6256 ; wdt:P610 ?item .
      ?item wdt:P625 ?coord ; wikibase:sitelinks ?sl .
      ${ON_EARTH}
      ${qty("P2044", "?elev")}
      ${IMAGE}
      ${ENWIKI}
      ${LABEL}
    } ORDER BY DESC(?sl) LIMIT 400`,
    "national high points",
  );
  const rows: Row[] = [...national.map((r) => ({ ...r, national: "1" })), ...tall, ...prominent];
  return pinsFromWikidata({
    ctx,
    rows,
    category: "geography",
    idPrefix: "peak",
    cap: 340,
    minSitelinks: 8,
    hook: (row, summary) => {
      const elev = num(row.elev);
      const parts: string[] = [];
      if (row.national === "1" && row.countryLabel && !/^Q\d+$/.test(row.countryLabel)) parts.push(`Highest point of ${row.countryLabel}`);
      if (elev !== undefined && elev > 0 && !firstSentenceMentions(summary, fmtInt(elev))) parts.push(`${fmtInt(elev)} m above sea level`);
      return parts.length ? `${parts.join(": ")}.` : null;
    },
    bonus: (row) => {
      const elev = num(row.elev) ?? 0;
      const prom = num(row.prom) ?? 0;
      return elev >= 8000 ? 0.25 : elev >= 7000 ? 0.12 : row.national === "1" ? 0.08 : prom >= 3000 ? 0.06 : 0;
    },
  });
}

interface FeatureClass {
  qids: string[];
  label: string;
  min: number; // sitelink bar in Europe / North America
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
    limit: 400,
    cap: 90,
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
    limit: 400,
    cap: 80,
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
    limit: 500,
    cap: 80,
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
  { qids: ["Q8514"], label: "deserts", min: 20, limit: 250, cap: 40, hook: () => null },
  {
    qids: ["Q150784"],
    label: "canyons",
    min: 12,
    limit: 300,
    cap: 55,
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
    limit: 300,
    cap: 55,
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
  { qids: ["Q83471", "Q177380"], label: "geysers & hot springs", min: 8, limit: 300, cap: 55, hook: () => null },
  { qids: ["Q188734", "Q334743", "Q7180402"], label: "sinkholes, cenotes & blue holes", min: 6, limit: 200, cap: 40, hook: () => null },
  { qids: ["Q45776", "Q42523"], label: "fjords & atolls", min: 15, limit: 300, cap: 50, hook: () => null },
  { qids: ["Q25391", "Q631305"], label: "dunes & rock formations", min: 12, limit: 400, cap: 65, hook: () => null },
  {
    qids: ["Q23442"],
    label: "islands",
    min: 40,
    limit: 900,
    cap: 80,
    select: "?area",
    extra: qty("P2046", "?area"),
    hook: (r) => {
      const area = num(r.area);
      return area && area > 0 ? `Island, ${fmtInt(area / 1e6)} km².` : null;
    },
  },
  {
    qids: ["Q46169"],
    label: "national parks",
    min: 25,
    limit: 900,
    cap: 90,
    select: "?area ?since",
    extra: `${qty("P2046", "?area")} OPTIONAL { ?item wdt:P571 ?since . }`,
    hook: (r) => {
      const area = num(r.area);
      const year = parseWdDate(r.since)?.year;
      const bits: string[] = [];
      if (year && year > 1800) bits.push(`since ${year}`);
      if (area && area > 0) bits.push(`${fmtInt(area / 1e6)} km²`);
      return bits.length ? `National park ${bits.join(", ")}.` : null;
    },
  },
  { qids: ["Q184358"], label: "reefs", min: 8, limit: 250, cap: 25, hook: () => null },
  { qids: ["Q124714"], label: "springs", min: 10, limit: 300, cap: 25, hook: () => null },
  { qids: ["Q40080"], label: "beaches", min: 12, limit: 300, cap: 35, hook: () => null },
  { qids: ["Q39816"], label: "valleys", min: 25, limit: 500, cap: 40, hook: () => null },
  { qids: ["Q4421"], label: "forests", min: 20, limit: 400, cap: 30, hook: () => null },
];

/** Natural wonders by class, each capped so no single class floods the pool. */
export async function buildFeatures(ctx: BuildContext): Promise<CachedPin[]> {
  const out: CachedPin[] = [];
  for (const f of FEATURES) {
    const rows = await sparql(
      classQuery({ classes: f.qids, minSitelinks: relax(f.min), limit: f.limit, select: f.select, optional: f.extra }),
      f.label,
    );
    const pins = await pinsFromWikidata({
      ctx,
      rows,
      category: "geography",
      idPrefix: "geo",
      cap: f.cap,
      minSitelinks: f.min,
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
    `SELECT ?item ?itemLabel ?coord ?sl ?article ?image ?since WHERE {
      ?item wdt:P757 ?whs ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
      FILTER(?sl >= ${relax(12)})
      ${ON_EARTH}
      OPTIONAL { ?item p:P1435 ?st . ?st ps:P1435 wd:Q9259 . ?st pq:P580 ?since . }
      ${IMAGE}
      ${ENWIKI}
      ${LABEL}
    } ORDER BY DESC(?sl) LIMIT 1500`,
    "world heritage",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "site",
    idPrefix: "unesco",
    cap: 420,
    minSitelinks: 12,
    hook: (row) => {
      const year = parseWdDate(row.since)?.year;
      return year ? `UNESCO World Heritage Site since ${year}.` : "UNESCO World Heritage Site.";
    },
  });
}
