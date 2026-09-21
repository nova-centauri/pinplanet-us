import { guessContinent } from "../continent";
import type { Pin } from "../types";

/**
 * NASA EONET: natural events open right now — erupting volcanoes, wildfires,
 * severe storms, floods, sea/lake ice. Public domain, CORS enabled.
 */

const API = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=45&limit=200";
const TTL_MS = 3 * 86_400_000;
const MAX_PINS = 45;

interface EonetEvent {
  id: string;
  title: string;
  description?: string | null;
  link: string;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  geometry: { date: string; type: string; coordinates: number[] | number[][]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[];
}

const CATEGORY: Record<string, { category: string; noun: string; weight: number }> = {
  volcanoes: { category: "volcano", noun: "Volcanic activity", weight: 3 },
  wildfires: { category: "natural disaster", noun: "Wildfire", weight: 1 },
  severeStorms: { category: "natural disaster", noun: "Severe storm", weight: 2.5 },
  floods: { category: "natural disaster", noun: "Flooding", weight: 2 },
  seaLakeIce: { category: "natural disaster", noun: "Sea or lake ice", weight: 0.6 },
  icebergs: { category: "natural disaster", noun: "Iceberg", weight: 1.2 },
  drought: { category: "natural disaster", noun: "Drought", weight: 1 },
  dustHaze: { category: "natural disaster", noun: "Dust and haze", weight: 0.8 },
  landslides: { category: "natural disaster", noun: "Landslide", weight: 1.5 },
  earthquakes: { category: "earthquake", noun: "Earthquake", weight: 1.5 },
  snow: { category: "natural disaster", noun: "Snow event", weight: 0.6 },
  tempExtremes: { category: "natural disaster", noun: "Temperature extreme", weight: 0.8 },
  waterColor: { category: "natural disaster", noun: "Algal bloom", weight: 0.5 },
  manmade: { category: "natural disaster", noun: "Man-made event", weight: 0.4 },
};

export async function fetchEonet(): Promise<Pin[]> {
  const res = await fetch(API, { cache: "no-cache" });
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data = (await res.json()) as { events: EonetEvent[] };
  const now = Date.now();
  const scored: { pin: Pin; score: number }[] = [];
  for (const ev of data.events) {
    const cat = ev.categories[0];
    const map = cat ? CATEGORY[cat.id] : undefined;
    if (!map) continue;
    const latest = [...ev.geometry].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    if (!latest) continue;
    const coords = latest.type === "Point" ? (latest.coordinates as number[]) : ((latest.coordinates as number[][])[0] ?? null);
    if (!coords || coords.length < 2) continue;
    const [lng, lat] = coords as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const when = Date.parse(latest.date);
    const ageDays = (now - when) / 86_400_000;
    if (ageDays > 45) continue;

    const size =
      typeof latest.magnitudeValue === "number" && latest.magnitudeUnit
        ? `${latest.magnitudeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${latest.magnitudeUnit}`
        : "";
    const title = ev.title.replace(/^(Wildfire|Volcano|Flood)\s+/i, "");
    const bits: string[] = [`${map.noun} reported ${ageDays < 1 ? "today" : `${Math.round(ageDays)} days ago`}${size ? `, ${size}` : ""}`];
    if (ev.description) bits.push(ev.description.replace(/\s+/g, " ").trim());
    bits.push(`Tracked by NASA's Earth Observatory Natural Event Tracker with ${ev.geometry.length} observation${ev.geometry.length === 1 ? "" : "s"}.`);
    const fact = bits.join(". ").replace(/\.\./g, ".");
    const source = ev.sources[0]?.url ?? ev.link;
    scored.push({
      score: map.weight * (1 + Math.log10(1 + (latest.magnitudeValue ?? 1))) / (1 + ageDays / 10),
      pin: {
        id: `eonet-${ev.id}`,
        title,
        category: map.category,
        family: "live",
        lat,
        lng,
        fact: fact.length > 280 ? `${fact.slice(0, 279)}…` : fact,
        storyUrl: source,
        storyLabel: ev.sources[0] ? `Source: ${ev.sources[0].id}` : "NASA EONET event",
        source: "eonet",
        added: latest.date.slice(0, 10),
        continent: guessContinent(lat, lng),
        imageUrl: "",
        credit: "NASA EONET",
        rank: Math.min(1, 0.4 + map.weight * 0.15),
        live: true,
        expires: when + TTL_MS,
        when,
        year: new Date(when).getUTCFullYear(),
      },
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_PINS).map((s) => s.pin);
}
