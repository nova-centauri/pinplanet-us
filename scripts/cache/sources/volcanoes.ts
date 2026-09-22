import { isPhotoUrl } from "../../../src/imagery";
import { fetchJson } from "../http";
import { CREDIT, rankFromSitelinks, type BuildContext, type CachedPin } from "../types";
import { articleTitle, sparql } from "../wikidata";
import { summaries } from "../wikipedia";
import { composeFact, eraYear, fmtInt, slugify } from "../text";
import { dedupeById, round } from "./common";

/**
 * Smithsonian Global Volcanism Program — every Holocene volcano on Earth
 * (~1,200), with the GVP geological summary, the primary photo, and the
 * "continuing eruption" list. Wikipedia articles are matched through
 * Wikidata's Smithsonian volcano ID so the story link is Wikipedia when one
 * exists and the GVP page otherwise.
 */

interface GvpVolcano {
  geometry: { coordinates: [number, number] };
  properties: {
    Volcano_Number: number;
    Volcano_Name: string;
    Primary_Volcano_Type?: string;
    Last_Eruption_Year?: number | null;
    Country?: string;
    Region?: string;
    Geological_Summary?: string;
    Latitude: number;
    Longitude: number;
    Elevation?: number | null;
    Tectonic_Setting?: string;
    Primary_Photo_Link?: string | null;
    Major_Rock_Type?: string;
  };
}

interface GvpEruption {
  properties: { VolcanoNumber: number; StartDateYear?: number; ContinuingEruption?: string; ExplosivityIndexMax?: number | null };
}

const WFS = "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=json&typeName=";

export const VOLCANO_CAP = 420;

export async function buildVolcanoes(ctx: BuildContext): Promise<CachedPin[]> {
  const [volcanoes, eruptions] = await Promise.all([
    fetchJson<{ features: GvpVolcano[] }>(`${WFS}GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes`, { maxAgeMs: 7 * 86_400_000 }),
    fetchJson<{ features: GvpEruption[] }>(`${WFS}GVP-VOTW:E3WebApp_Eruptions1960`, { maxAgeMs: 2 * 86_400_000 }),
  ]);
  process.stderr.write(`  gvp: ${volcanoes.features.length} volcanoes, ${eruptions.features.length} eruptions since 1960\n`);

  const erupting = new Set<number>();
  const vei = new Map<number, number>();
  for (const e of eruptions.features) {
    const p = e.properties;
    if (String(p.ContinuingEruption).toLowerCase() === "true") erupting.add(p.VolcanoNumber);
    if (typeof p.ExplosivityIndexMax === "number") vei.set(p.VolcanoNumber, Math.max(vei.get(p.VolcanoNumber) ?? 0, p.ExplosivityIndexMax));
  }

  // Wikipedia mapping via Wikidata's Global Volcanism Program ID (P1886).
  const rows = await sparql(
    `SELECT ?item ?vnum ?sl ?article WHERE {
      ?item wdt:P1886 ?vnum ; wikibase:sitelinks ?sl .
      ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
    }`,
    "volcano↔wikipedia",
  );
  const wiki = new Map<number, { title: string; sl: number }>();
  for (const r of rows) {
    const n = Number(r.vnum);
    if (!Number.isFinite(n) || !r.article) continue;
    const prev = wiki.get(n);
    const sl = Number(r.sl ?? 0);
    if (!prev || sl > prev.sl) wiki.set(n, { title: articleTitle(r.article), sl });
  }
  process.stderr.write(`  gvp: ${wiki.size} volcanoes matched to Wikipedia\n`);

  // Score: fame (sitelinks) + recency of activity + having a photo.
  type Scored = { v: GvpVolcano; score: number; title?: string; sl: number };
  const scored: Scored[] = volcanoes.features
    .filter((v) => v.properties.Geological_Summary && Number.isFinite(v.properties.Latitude))
    .map((v) => {
      const p = v.properties;
      const w = wiki.get(p.Volcano_Number);
      const last = typeof p.Last_Eruption_Year === "number" ? p.Last_Eruption_Year : null;
      let score = w ? rankFromSitelinks(w.sl) : 0;
      if (last !== null) score += last >= 1900 ? 0.25 : last >= 1000 ? 0.12 : 0.05;
      if (erupting.has(p.Volcano_Number)) score += 0.35;
      if (p.Primary_Photo_Link) score += 0.05;
      if ((vei.get(p.Volcano_Number) ?? 0) >= 4) score += 0.1;
      return { v, score, title: w?.title, sl: w?.sl ?? 0 };
    })
    .sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, ctx.limit ?? VOLCANO_CAP);
  const wp = await summaries(picked.filter((s) => s.title).map((s) => s.title!));

  const pins: CachedPin[] = [];
  for (const { v, score, title } of picked) {
    const p = v.properties;
    const lat = p.Latitude;
    const lng = p.Longitude;
    const type = normaliseType(p.Primary_Volcano_Type);
    const elev = typeof p.Elevation === "number" ? p.Elevation : null;
    const last = typeof p.Last_Eruption_Year === "number" ? p.Last_Eruption_Year : null;
    const hookParts: string[] = [];
    hookParts.push(`${type}${elev !== null ? `, ${fmtInt(elev)} m` : ""}${p.Country ? ` in ${p.Country}` : ""}.`);
    if (erupting.has(p.Volcano_Number)) hookParts.push(`Erupting as of ${monthLabel(ctx.today)}.`);
    else if (last !== null) hookParts.push(`Last erupted ${eraYear(last)}.`);
    else hookParts.push("No eruption in recorded history.");
    const fact = composeFact(hookParts.join(" "), p.Geological_Summary ?? "");

    const summary = title ? wp.get(title) : undefined;
    const usable = summary && !summary.missing;
    const storyUrl = usable ? summary!.url : `https://volcano.si.edu/volcano.cfm?vn=${p.Volcano_Number}`;
    const storyLabel = usable ? `Wikipedia: ${summary!.title}` : `Smithsonian GVP: ${p.Volcano_Name}`;
    const flags: string[] = [];
    if (erupting.has(p.Volcano_Number)) flags.push("erupting");

    const pin: CachedPin = {
      id: `gvp-${p.Volcano_Number}`,
      title: p.Volcano_Name,
      category: "volcano",
      lat: round(lat),
      lng: round(lng),
      fact,
      story_url: storyUrl,
      story_label: storyLabel,
      source: "gvp",
      added: ctx.today,
      continent: ctx.continentOf(lat, lng),
      credit: CREDIT.gvp,
      rank: round(Math.min(1, score), 3),
    };
    const image = p.Primary_Photo_Link || (usable && isPhotoUrl(summary!.image) ? summary!.image : null);
    if (image) pin.image_url = image;
    if (last !== null) pin.year = last;
    if (flags.length) pin.flags = flags;
    pins.push(pin);
  }
  process.stderr.write(`  gvp: ${erupting.size} volcanoes flagged as erupting\n`);
  return dedupeById(pins);
}

function normaliseType(raw: string | undefined): string {
  if (!raw) return "Volcano";
  let t = raw.replace(/\((s|es)\)/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/\?$/, "");
  const lower = t.toLowerCase();
  if (lower === "shield") return "Shield volcano";
  if (lower === "complex") return "Complex volcano";
  if (lower === "compound") return "Compound volcano";
  if (lower === "submarine") return "Submarine volcano";
  if (lower === "subglacial") return "Subglacial volcano";
  if (lower === "caldera") return "Caldera";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export { slugify };
