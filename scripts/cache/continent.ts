import { fetchJson } from "./http";
import { guessContinent } from "../../src/continent";
import type { Continent } from "../../src/types";

/**
 * Point-in-polygon continent lookup over Natural Earth 1:110m countries
 * (public domain). Open-ocean points fall back to the rule-based guess.
 */

type Ring = [number, number][];
interface Feature {
  properties: { CONTINENT?: string; NAME?: string; ADM0_A3?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][] };
}

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

const MAP: Record<string, Continent> = {
  Africa: "africa",
  Antarctica: "antarctica",
  Asia: "asia",
  Europe: "europe",
  "North America": "north-america",
  Oceania: "oceania",
  "South America": "south-america",
};

interface Poly {
  rings: Ring[];
  bbox: [number, number, number, number];
  continent: Continent;
  name: string;
  iso: string;
}

let polys: Poly[] | null = null;

export async function loadContinents(): Promise<void> {
  const data = await fetchJson<{ features: Feature[] }>(NE_URL, { salt: "ne110m" });
  polys = [];
  for (const f of data.features) {
    const raw = f.properties.CONTINENT ?? "";
    const continent = MAP[raw];
    if (!continent) continue;
    const name = f.properties.NAME ?? "";
    const iso = f.properties.ADM0_A3 ?? "";
    const groups = f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
    for (const rings of groups) {
      let minX = 180,
        minY = 90,
        maxX = -180,
        maxY = -90;
      for (const [x, y] of rings[0] ?? []) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      polys.push({ rings, bbox: [minX, minY, maxX, maxY], continent, name, iso });
    }
  }
  process.stderr.write(`  continents: ${polys.length} polygons loaded\n`);
}

function inRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inPoly(p: Poly, x: number, y: number): boolean {
  const [minX, minY, maxX, maxY] = p.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  if (!inRing(p.rings[0]!, x, y)) return false;
  for (let i = 1; i < p.rings.length; i++) if (inRing(p.rings[i]!, x, y)) return false;
  return true;
}

/** Political overrides where Natural Earth's single-continent tag is wrong for a point. */
function refine(p: Poly, lat: number, lng: number): Continent {
  switch (p.iso) {
    case "RUS":
      return lng > 60 || (lat > 66 && lng > 45) ? "asia" : "europe";
    case "USA":
      return lng < -150 && lat < 25 ? "oceania" : "north-america";
    case "FRA":
      if (lat < 10 && lng < -50) return "south-america";
      return p.continent;
    case "IDN":
      return lng > 130 ? "oceania" : "asia";
    case "TUR":
      return lng < 28.5 && lat > 40.5 ? "europe" : "asia";
    case "KAZ":
      return lng < 51.5 ? "europe" : "asia";
    case "EGY":
      return lng > 34.3 ? "asia" : "africa";
    case "ESP":
      return lat < 30 ? "africa" : "europe"; // Canary Islands
    case "PRT":
      return lat < 34 ? "africa" : "europe"; // Madeira
    case "CHL":
      return lng < -100 ? "oceania" : "south-america"; // Easter Island
    case "ECU":
      return lng < -85 ? "south-america" : "south-america";
    case "GRL":
      return "north-america";
    case "ATF":
    case "ATA":
      return "antarctica";
    default:
      return p.continent;
  }
}

/** Continent for a coordinate: polygon hit → nearest polygon (≤ 3°) → rule guess. */
export function continentOf(lat: number, lng: number): Continent {
  if (!polys) return guessContinent(lat, lng);
  for (const p of polys) if (inPoly(p, lng, lat)) return refine(p, lat, lng);
  // Coastal/island miss: pick the closest polygon vertex within ~3 degrees.
  let best: Poly | null = null;
  let bestD = 3 * 3;
  for (const p of polys) {
    const [minX, minY, maxX, maxY] = p.bbox;
    if (lng < minX - 3 || lng > maxX + 3 || lat < minY - 3 || lat > maxY + 3) continue;
    for (const ring of p.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = ring[i]!;
        const dx = (x - lng) * Math.cos((lat * Math.PI) / 180);
        const dy = y - lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
  }
  if (best) return refine(best, lat, lng);
  return guessContinent(lat, lng);
}
