import seed from "../data/seed-pins.json";
import { CONTINENT_LABEL, guessContinent } from "./continent";
import type { Continent, Pin, SeedPin } from "./types";
import { familyOf } from "./types";

const SEED_CONTINENTS: Record<string, Continent> = {
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

/** Normalise a stored pin (seed or cached) into the app shape. */
export function toPin(raw: SeedPin): Pin {
  const continent = raw.continent ?? SEED_CONTINENTS[raw.id] ?? guessContinent(raw.lat, raw.lng);
  const pin: Pin = {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    family: familyOf(raw.category),
    lat: raw.lat,
    lng: raw.lng,
    fact: raw.fact,
    storyUrl: raw.story_url,
    storyLabel: raw.story_label,
    source: raw.source,
    added: raw.added,
    continent,
    imageUrl: raw.image_url ?? "",
    credit: raw.credit ?? (raw.source === "curated" ? "Hand-curated" : ""),
    rank: typeof raw.rank === "number" ? raw.rank : raw.source === "curated" ? 0.95 : 0.5,
  };
  if (raw.year !== undefined) pin.year = raw.year;
  if (raw.day) pin.day = raw.day;
  if (raw.flags?.length) pin.flags = raw.flags;
  return pin;
}

/** The 29 hand-curated seeds, bundled so the globe has pins before any fetch. */
export function loadPins(): Pin[] {
  return (seed as SeedPin[]).map(toPin);
}

/** Cached pool built by scripts/cache (public/data/pins.json). */
export async function loadCachedPins(url = "/data/pins.json"): Promise<Pin[]> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`cache ${res.status}`);
  const raw = (await res.json()) as SeedPin[];
  return raw.map(toPin);
}

export const continentLabel = CONTINENT_LABEL;

/**
 * The live pool. Seeds + cache + provider pins, deduped by id, with expiry.
 * `version` bumps whenever the pool changes so renderers can rebuild lazily.
 */
export class PinPool {
  readonly byId = new Map<string, Pin>();
  version = 0;

  get pins(): Pin[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }

  add(pins: Pin[]): number {
    let added = 0;
    for (const pin of pins) {
      const prev = this.byId.get(pin.id);
      if (prev && prev.live && pin.live) {
        // Refresh a live pin in place (position, fact, expiry).
        Object.assign(prev, pin);
        continue;
      }
      if (prev) continue;
      this.byId.set(pin.id, pin);
      added += 1;
    }
    if (added) this.version += 1;
    return added;
  }

  /** Remove expired live pins. Returns how many left. */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [id, pin] of this.byId) {
      if (pin.expires && pin.expires < now) {
        this.byId.delete(id);
        removed += 1;
      }
    }
    if (removed) this.version += 1;
    return removed;
  }

  liveCount(): number {
    let n = 0;
    for (const pin of this.byId.values()) if (pin.live) n += 1;
    return n;
  }
}
