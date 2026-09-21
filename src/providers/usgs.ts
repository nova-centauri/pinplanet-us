import { guessContinent } from "../continent";
import type { Pin } from "../types";

/**
 * USGS earthquakes, magnitude 4.5+ in the past week. Public domain, CORS
 * enabled, updated every minute. Every event arrives with a tight epicenter.
 */

const FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
const TTL_MS = 7 * 86_400_000;
const MAX_PINS = 80;

interface Feature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string;
    tsunami: number;
    felt: number | null;
    alert: string | null;
    sig: number;
    magType: string;
    type: string;
    title: string;
  };
  geometry: { coordinates: [number, number, number] };
}

export async function fetchQuakes(): Promise<Pin[]> {
  const res = await fetch(FEED, { cache: "no-cache" });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const data = (await res.json()) as { features: Feature[] };
  const now = Date.now();
  const pins: Pin[] = [];
  const sorted = data.features
    .filter((f) => f.properties.type === "earthquake" && typeof f.properties.mag === "number")
    .sort((a, b) => (b.properties.mag ?? 0) - (a.properties.mag ?? 0));
  for (const f of sorted.slice(0, MAX_PINS)) {
    const [lng, lat, depth] = f.geometry.coordinates;
    const p = f.properties;
    const mag = p.mag ?? 0;
    const place = cleanPlace(p.place);
    const ago = agoLabel(now - p.time);
    const bits: string[] = [`Magnitude ${mag.toFixed(1)} earthquake ${ago}, ${Math.round(depth)} km deep`];
    if (p.tsunami) bits.push("a tsunami advisory was issued");
    if (p.felt && p.felt > 0) bits.push(`${p.felt.toLocaleString()} people reported feeling it`);
    if (p.alert && p.alert !== "green") bits.push(`USGS ${p.alert} alert`);
    const fact = `${bits.join(" — ")}. ${describe(mag)}`;
    pins.push({
      id: `usgs-${f.id}`,
      title: `M${mag.toFixed(1)} · ${place}`,
      category: "earthquake",
      family: "live",
      lat,
      lng,
      fact: fact.length > 280 ? `${fact.slice(0, 279)}…` : fact,
      storyUrl: p.url,
      storyLabel: "USGS event page",
      source: "usgs",
      added: new Date(p.time).toISOString().slice(0, 10),
      continent: guessContinent(lat, lng),
      imageUrl: "",
      credit: "USGS Earthquake Hazards Program",
      rank: Math.min(1, 0.35 + (mag - 4.5) * 0.22),
      live: true,
      expires: p.time + TTL_MS,
      when: p.time,
      year: new Date(p.time).getUTCFullYear(),
    });
  }
  return pins;
}

function cleanPlace(place: string | null): string {
  if (!place) return "open ocean";
  return place.replace(/^\d+\s*km\s+[NSEW]{1,3}\s+of\s+/i, (m) => m.toLowerCase());
}

function agoLabel(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function describe(mag: number): string {
  if (mag >= 8) return "Great earthquake: the kind that reshapes coastlines and is felt across an entire region.";
  if (mag >= 7) return "Major quake: serious damage is likely near the epicenter.";
  if (mag >= 6) return "Strong quake: about 120 of these happen worldwide each year.";
  if (mag >= 5) return "Moderate quake: felt widely, minor damage to weak buildings. Roughly 1,500 a year worldwide.";
  return "Light quake: felt indoors, rattles dishes. Around 15,000 of these strike every year.";
}
