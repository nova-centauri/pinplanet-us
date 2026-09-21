import seed from "../data/seed-pins.json";
import type { Continent, Pin, SeedPin } from "./types";

const CONTINENTS: Record<string, Continent> = {
  "darvaza-gas-crater": "asia",
  "salar-de-uyuni": "south-america",
  "giants-causeway": "europe",
  "paris-catacombs": "europe",
  "sagrada-familia": "europe",
  "sedlec-ossuary": "europe",
  "mariana-trench": "oceania",
  "danakil-depression": "africa",
  sossusvlei: "africa",
  zhangjiajie: "asia",
  socotra: "asia",
  "fly-geyser": "north-america",
  "up-helly-aa": "europe",
  pompeii: "europe",
  roswell: "north-america",
  lascaux: "europe",
  "machu-picchu": "south-america",
  "whittier-alaska": "north-america",
  "monowi-nebraska": "north-america",
  "centralia-pa": "north-america",
  longyearbyen: "europe",
  "coober-pedy": "oceania",
  chefchaouen: "africa",
  giethoorn: "europe",
  hallstatt: "europe",
  "burj-khalifa": "asia",
  "angel-falls": "south-america",
  oymyakon: "asia",
  "pando-aspen": "north-america",
};

function continentOf(pin: SeedPin): Continent {
  const tagged = CONTINENTS[pin.id];
  if (tagged) return tagged;
  // Last-resort geographic guess so a future seed still tours.
  const { lat, lng } = pin;
  if (lat < -60) return "antarctica";
  if (lng >= 110 && lng <= 180 && lat < 0) return "oceania";
  if (lng >= -180 && lng < -30 && lat > 15) return "north-america";
  if (lng >= -90 && lng < -30 && lat <= 15) return "south-america";
  if (lng >= -30 && lng < 55 && lat < 37 && lat > -35) return "africa";
  if (lng >= -25 && lng < 40 && lat >= 36) return "europe";
  return "asia";
}

export function loadPins(): Pin[] {
  return (seed as SeedPin[]).map((raw) => ({
    id: raw.id,
    title: raw.title,
    category: raw.category,
    lat: raw.lat,
    lng: raw.lng,
    fact: raw.fact,
    storyUrl: raw.story_url,
    storyLabel: raw.story_label,
    added: raw.added,
    continent: continentOf(raw),
    imageUrl: "",
  }));
}

export const continentLabel: Record<Continent, string> = {
  africa: "Africa",
  antarctica: "Antarctica",
  asia: "Asia",
  europe: "Europe",
  "north-america": "North America",
  oceania: "Oceania",
  "south-america": "South America",
};
