import type { BuildContext, CachedPin } from "../types";
import { classQuery, parseWdDate, qty, relax, sparql, type Row } from "../wikidata";
import { dateLabel, fmtInt, fmtNum } from "../text";
import { dedupeById, firstSentenceMentions, num, pinsFromWikidata } from "./common";

/** Battles & sieges with a date and a battlefield coordinate. */
export async function buildBattles(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q178561", "Q188055", "Q1261499"],
      minSitelinks: relax(16),
      limit: 1400,
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
    cap: 460,
    minSitelinks: 16,
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
      minSitelinks: relax(6),
      limit: 700,
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
    cap: 160,
    minSitelinks: 6,
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
      minSitelinks: relax(7),
      limit: 900,
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
    cap: 260,
    minSitelinks: 7,
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

/** Tsunamis, floods, avalanches, landslides, eruptions, wildfires, tornadoes with a place on the map. */
export async function buildDisasters(ctx: BuildContext): Promise<CachedPin[]> {
  const groups: { classes: string[]; min: number; limit: number; cap: number; label: string; noun: string }[] = [
    { classes: ["Q8070"], min: 8, limit: 250, cap: 30, label: "tsunamis", noun: "Tsunami" },
    { classes: ["Q7692360"], min: 8, limit: 300, cap: 35, label: "volcanic eruptions", noun: "Eruption" },
    { classes: ["Q8068"], min: 12, limit: 400, cap: 30, label: "floods", noun: "Flood" },
    { classes: ["Q7935"], min: 6, limit: 150, cap: 15, label: "avalanches", noun: "Avalanche" },
    { classes: ["Q167903"], min: 6, limit: 200, cap: 20, label: "landslides", noun: "Landslide" },
    { classes: ["Q169950"], min: 8, limit: 300, cap: 25, label: "wildfires", noun: "Wildfire" },
    { classes: ["Q8081"], min: 8, limit: 250, cap: 20, label: "tornadoes", noun: "Tornado" },
  ];
  const out: CachedPin[] = [];
  for (const g of groups) {
    const rows = await sparql(
      classQuery({
        classes: g.classes,
        minSitelinks: relax(g.min),
        limit: g.limit,
        select: "?date ?deaths",
        optional: `OPTIONAL { ?item wdt:P585 ?date . } OPTIONAL { ?item wdt:P580 ?date . } OPTIONAL { ?item wdt:P1120 ?deaths . }`,
      }),
      g.label,
    );
    out.push(
      ...(await pinsFromWikidata({
        ctx,
        rows,
        category: "natural disaster",
        idPrefix: "disaster",
        cap: g.cap,
        minSitelinks: g.min,
        hook: (row, summary) => disasterHook(g.noun, row, summary),
        year: (row) => parseWdDate(row.date)?.year,
        bonus: (row) => ((num(row.deaths) ?? 0) >= 1000 ? 0.12 : 0),
      })),
    );
  }
  return dedupeById(out);
}

function disasterHook(noun: string, row: Row, summary: Parameters<typeof firstSentenceMentions>[0]): string | null {
  const label = dateLabel(row.date);
  const year = parseWdDate(row.date)?.year;
  const date = label && !firstSentenceMentions(summary, year) ? label : null;
  const deathsRaw = num(row.deaths);
  const deaths = deathsRaw !== undefined && deathsRaw >= 50 && !firstSentenceMentions(summary, fmtInt(deathsRaw)) ? fmtInt(deathsRaw) : null;
  if (!date && !deaths) return null;
  let hook = noun;
  if (date) hook += `, ${date}`;
  if (deaths) hook += `; ${deaths} dead`;
  return `${hook}.`;
}

/** Confirmed impact craters. */
export async function buildCraters(ctx: BuildContext): Promise<CachedPin[]> {
  const rows = await sparql(
    classQuery({
      classes: ["Q55818"],
      minSitelinks: 2,
      limit: 450,
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
    cap: 190,
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
      minSitelinks: 3,
      limit: 450,
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
    cap: 140,
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
    classQuery({ classes: ["Q74047"], minSitelinks: relax(5), limit: 500 }),
    "ghost towns",
  );
  return pinsFromWikidata({ ctx, rows, category: "random place", idPrefix: "ghost", cap: 120, minSitelinks: 5, exemptFromTightness: true });
}

/** Archaeological sites, ancient cities, pyramids, megaliths, amphitheatres. */
export async function buildAncient(ctx: BuildContext): Promise<CachedPin[]> {
  const groups: { classes: string[]; min: number; limit: number; cap: number; label: string }[] = [
    { classes: ["Q839954"], min: 20, limit: 800, cap: 170, label: "archaeological sites" },
    { classes: ["Q15661340"], min: 16, limit: 500, cap: 120, label: "ancient cities" },
    { classes: ["Q12516"], min: 7, limit: 200, cap: 45, label: "pyramids" },
    { classes: ["Q164240", "Q1935728"], min: 6, limit: 250, cap: 45, label: "megaliths" },
    { classes: ["Q54831"], min: 6, limit: 150, cap: 30, label: "roman amphitheatres" },
  ];
  const out: CachedPin[] = [];
  for (const g of groups) {
    const rows = await sparql(classQuery({ classes: g.classes, minSitelinks: relax(g.min), limit: g.limit }), g.label);
    out.push(...(await pinsFromWikidata({ ctx, rows, category: "ancient", idPrefix: "ancient", cap: g.cap, minSitelinks: g.min })));
  }
  return dedupeById(out);
}

/** Science & space infrastructure: launch sites, observatories, polar stations, colliders, reactors, radio telescopes, nuclear accidents. */
export async function buildScience(ctx: BuildContext): Promise<CachedPin[]> {
  const groups: { classes: string[]; min: number; limit: number; cap: number; label: string }[] = [
    { classes: ["Q194188"], min: 6, limit: 150, cap: 40, label: "spaceports" },
    { classes: ["Q62832"], min: 14, limit: 300, cap: 60, label: "observatories" },
    { classes: ["Q749622"], min: 6, limit: 150, cap: 30, label: "antarctic stations" },
    { classes: ["Q130825"], min: 6, limit: 100, cap: 20, label: "particle accelerators" },
    { classes: ["Q1620824"], min: 10, limit: 100, cap: 20, label: "nuclear accidents" },
    { classes: ["Q184356"], min: 6, limit: 200, cap: 30, label: "radio telescopes" },
    { classes: ["Q134447"], min: 12, limit: 300, cap: 35, label: "nuclear power plants" },
  ];
  const out: CachedPin[] = [];
  for (const g of groups) {
    const rows = await sparql(
      classQuery({ classes: g.classes, minSitelinks: relax(g.min), limit: g.limit, select: "?date", optional: `OPTIONAL { ?item wdt:P585 ?date . }` }),
      g.label,
    );
    out.push(
      ...(await pinsFromWikidata({
        ctx,
        rows,
        category: "science",
        idPrefix: "science",
        cap: g.cap,
        minSitelinks: g.min,
        year: (row) => parseWdDate(row.date)?.year,
      })),
    );
  }
  return dedupeById(out);
}
