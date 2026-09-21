import type { Continent } from "./types";

/**
 * Rule-based continent guess from coordinates. Used at runtime for dynamic
 * pins (earthquakes, EONET events) and as the open-ocean fallback for the
 * build-time Natural Earth polygon lookup. Boxes are deliberately generous:
 * the continent only drives the "never hop within one continent" rule and
 * a label, so a wrong call on a remote island is cosmetic, not fatal.
 */
export function guessContinent(lat: number, lng: number): Continent {
  if (lat <= -60) return "antarctica";

  // Oceania: Australia, NZ, Melanesia, Micronesia, Polynesia, Hawaii.
  if (lng >= 110 && lng <= 180 && lat < -8) return "oceania";
  if (lng >= 130 && lng <= 180 && lat >= -8 && lat < 22) return "oceania";
  if (lng <= -150 && lat < 30 && lat > -60) return "oceania";
  if (lng >= -150 && lng < -100 && lat < -5) return "oceania";

  // Americas.
  if (lng >= -170 && lng < -30) {
    if (lat > 12) return "north-america";
    if (lat > 7 && lng < -77) return "north-america"; // Central America / Panama
    return "south-america";
  }

  // Africa: mainland + Madagascar, north to the Med, east to ~52°E.
  if (lng >= -25 && lng < 52 && lat < 37.5 && lat > -36) {
    if (lat > 30 && lng > 34) return "asia"; // Levant / Sinai east
    if (lat > 12 && lng > 43.5) return "asia"; // Arabian peninsula
    return "africa";
  }

  // Europe: west of the Urals (~60°E), north of the Med/Caucasus.
  if (lng >= -25 && lng < 60 && lat >= 36) {
    if (lng > 26 && lat < 42.5 && lng < 45) return "asia"; // Anatolia
    if (lng > 45 && lat < 46) return "asia"; // Caucasus south
    return "europe";
  }
  if (lng < -25 && lat > 55) return "north-america"; // Greenland / Iceland west

  return "asia";
}

export const CONTINENT_LABEL: Record<Continent, string> = {
  africa: "Africa",
  antarctica: "Antarctica",
  asia: "Asia",
  europe: "Europe",
  "north-america": "North America",
  oceania: "Oceania",
  "south-america": "South America",
};
