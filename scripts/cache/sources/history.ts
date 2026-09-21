import type { BuildContext, CachedPin } from "../types";
import { classQuery, parseWdDate, qty, sparql } from "../wikidata";
import { dateLabel, fmtInt, fmtNum } from "../text";
import { firstSentenceMentions, num, pinsFromWikidata } from "./common";

/** Battles & sieges with a date and a battlefield coordinate. */
export async function buildBattles(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q178561", "Q188055", "Q1261499"],
      minSitelinks: 22,
      limit: 700,
      select: "?date",
      optional: `OPTIONAL { ?item wdt:P585 ?date . } OPTIONAL { ?item wdt:P580 ?date . }`,
    }),
    "battles",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "battle",
    idPrefix: "battle",
    cap: 320,
    hook: (row, summary) => {
      const label = dateLabel(row.date);
      const year = parseWdDate(row.date)?.year;
      if (!label || firstSentenceMentions(summary, year)) return null;
      return `Fought ${label}.`;
    },
    year: (row) => parseWdDate(row.date)?.year,
  });
}

/** Shipwrecks whose resting place is charted. */
export async function buildShipwrecks(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q852190"],
      minSitelinks: 8,
      limit: 400,
      select: "?date",
      optional: `OPTIONAL { ?item wdt:P576 ?date . } OPTIONAL { ?item wdt:P585 ?date . }`,
    }),
    "shipwrecks",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "shipwreck",
    idPrefix: "wreck",
    cap: 110,
    focus: /\b(sank|sunk|scuttled|torpedoed|wrecked|foundered|ran aground|capsized|struck a mine|was lost|went down|broke apart|exploded|disappeared)\b/i,
    hook: (row, summary) => {
      const label = dateLabel(row.date);
      const year = parseWdDate(row.date)?.year;
      if (!label || firstSentenceMentions(summary, year)) return null;
      return `Lost ${label}.`;
    },
    year: (row) => parseWdDate(row.date)?.year,
  });
}

/** Historic earthquakes with a magnitude on record. */
export async function buildQuakes(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q7944"],
      minSitelinks: 10,
      limit: 500,
      select: "?date ?mag ?mw ?deaths",
      optional: `OPTIONAL { ?item wdt:P585 ?date . }
        OPTIONAL { ?item wdt:P2528 ?mag . }
        OPTIONAL { ?item wdt:P2527 ?mw . }
        OPTIONAL { ?item wdt:P1120 ?deaths . }`,
    }),
    "earthquakes",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "earthquake",
    idPrefix: "quake",
    cap: 170,
    hook: (row, summary) => {
      const magRaw = num(row.mw) ?? num(row.mag);
      const mag = magRaw !== undefined && magRaw > 0 && magRaw < 10 && !firstSentenceMentions(summary, fmtNum(magRaw)) ? fmtNum(magRaw) : null;
      const label = dateLabel(row.date);
      const date = label && !firstSentenceMentions(summary, parseWdDate(row.date)?.year) ? label : null;
      const deathsRaw = num(row.deaths);
      const deaths = deathsRaw !== undefined && deathsRaw >= 100 && !firstSentenceMentions(summary, fmtInt(deathsRaw)) ? fmtInt(deathsRaw) : null;
      if (!mag && !date && !deaths) return null;
      let hook = mag ? `Magnitude ${mag}` : date ? "Struck" : "";
      if (date) hook += mag ? ` on ${date}` : ` ${date}`;
      if (deaths) hook += hook ? `; ${deaths} dead` : `Death toll: ${deaths}`;
      return `${hook}.`;
    },
    year: (row) => parseWdDate(row.date)?.year,
    bonus: (row) => {
      const mag = num(row.mw) ?? num(row.mag) ?? 0;
      return mag >= 8.5 ? 0.25 : mag >= 7.5 ? 0.12 : 0;
    },
  });
}

/** Confirmed impact craters. */
export async function buildCraters(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q55818"],
      minSitelinks: 4,
      limit: 350,
      select: "?diam",
      optional: qty("P2386", "?diam"),
    }),
    "impact craters",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "impact",
    idPrefix: "crater",
    cap: 150,
    hook: (row, summary) => {
      const m = num(row.diam);
      if (m === undefined || m <= 0) return null;
      const km = m / 1000;
      const label = km >= 1 ? `${fmtNum(km)} km` : `${fmtInt(m)} m`;
      if (firstSentenceMentions(summary, label.split(" ")[0])) return null;
      return `Impact crater, ${label} across.`;
    },
    bonus: (row) => {
      const km = (num(row.diam) ?? 0) / 1000;
      return km >= 50 ? 0.2 : km >= 10 ? 0.1 : 0;
    },
  });
}

/** Meteorites with a known fall/find site. */
export async function buildMeteorites(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q60186"],
      minSitelinks: 5,
      limit: 350,
      select: "?mass ?date",
      optional: `${qty("P2067", "?mass")} OPTIONAL { ?item wdt:P585 ?date . } OPTIONAL { ?item wdt:P575 ?date . }`,
    }),
    "meteorites",
  );
  return pinsFromWikidata({
    ctx,
    rows,
    category: "impact",
    idPrefix: "meteorite",
    cap: 120,
    hook: (row, summary) => {
      const kg = num(row.mass);
      const label = dateLabel(row.date);
      const year = parseWdDate(row.date)?.year;
      const parts: string[] = [];
      if (kg !== undefined && kg > 0) {
        const mass = kg >= 1000 ? `${fmtNum(kg / 1000)} tonnes` : kg >= 1 ? `${fmtNum(kg)} kg` : `${fmtInt(kg * 1000)} g`;
        parts.push(`Meteorite, ${mass}`);
      }
      if (label && !firstSentenceMentions(summary, year)) parts.push(parts.length ? `recorded ${label}` : `Meteorite recorded ${label}`);
      if (!parts.length) return null;
      return `${parts.join(", ")}.`;
    },
    year: (row) => parseWdDate(row.date)?.year,
    bonus: (row) => ((num(row.mass) ?? 0) >= 1000 ? 0.15 : 0),
  });
}

/** Abandoned towns and cities. */
export async function buildGhostTowns(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({ classes: ["Q74047"], minSitelinks: 6, limit: 300 }),
    "ghost towns",
  );
  return pinsFromWikidata({ ctx, rows, category: "random place", idPrefix: "ghost", cap: 80, exemptFromTightness: true });
}

/** Archaeological sites, ancient cities, pyramids, megaliths, amphitheatres. */
export async function buildAncient(ctx: BuildContext): Promise<CachedPin[]> {
  const groups: { classes: string[]; min: number; limit: number; label: string }[] = [
    { classes: ["Q839954"], min: 28, limit: 500, label: "archaeological sites" },
    { classes: ["Q15661340"], min: 22, limit: 300, label: "ancient cities" },
    { classes: ["Q12516"], min: 10, limit: 150, label: "pyramids" },
    { classes: ["Q164240", "Q1935728"], min: 8, limit: 150, label: "megaliths" },
    { classes: ["Q54831"], min: 8, limit: 120, label: "roman amphitheatres" },
  ];
  const rows = [];
  for (const g of groups) {
    rows.push(...(await sparql(classQuery({ classes: g.classes, minSitelinks: g.min, limit: g.limit }), g.label)));
  }
  return pinsFromWikidata({ ctx, rows, category: "ancient", idPrefix: "ancient", cap: 260 });
}

/** Science & space infrastructure: launch sites, observatories, polar stations, colliders, nuclear accidents. */
export async function buildScience(ctx: BuildContext): Promise<CachedPin[]> {
  const groups: { classes: string[]; min: number; limit: number; label: string }[] = [
    { classes: ["Q194188"], min: 8, limit: 120, label: "spaceports" },
    { classes: ["Q62832"], min: 18, limit: 200, label: "observatories" },
    { classes: ["Q749622"], min: 8, limit: 120, label: "antarctic stations" },
    { classes: ["Q130825"], min: 8, limit: 80, label: "particle accelerators" },
    { classes: ["Q1620824"], min: 12, limit: 80, label: "nuclear accidents" },
  ];
  const rows = [];
  for (const g of groups) {
    rows.push(...(await sparql(classQuery({ classes: g.classes, minSitelinks: g.min, limit: g.limit, select: "?date", optional: `OPTIONAL { ?item wdt:P585 ?date . }` }), g.label)));
  }
  return pinsFromWikidata({
    ctx,
    rows,
    category: "science",
    idPrefix: "science",
    cap: 150,
    year: (row) => parseWdDate(row.date)?.year,
  });
}
