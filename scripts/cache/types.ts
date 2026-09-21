import type { Continent } from "../../src/types";

/**
 * A cached pin, as written to public/data/pins.json. Field names mirror
 * planning/02-pin-schema.md (snake_case, like data/seed-pins.json).
 */
export interface CachedPin {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
  fact: string;
  story_url: string;
  story_label: string;
  source: string; // wikidata | gvp | pbdb | wikipedia | wikipedia-otd
  added: string; // ISO date of the build
  continent: Continent;
  image_url?: string;
  year?: number; // negative = BCE
  day?: string; // "MM-DD" for on-this-day pins
  credit?: string; // text attribution shown on the card
  rank?: number; // 0..1 fame proxy (Wikipedia sitelinks)
  flags?: string[]; // e.g. ["erupting"]
}

export interface BuildContext {
  today: string;
  continentOf: (lat: number, lng: number) => Continent;
  limit: number | null; // dev: cap rows per source
}

export type SourceBuilder = (ctx: BuildContext) => Promise<CachedPin[]>;

export const CREDIT = {
  wikipedia: "Wikipedia · CC BY-SA 4.0",
  wikidata: "Wikidata · CC0",
  gvp: "Smithsonian Global Volcanism Program",
  pbdb: "Paleobiology Database · CC BY 4.0",
} as const;

/** Sitelink count → 0..1 (log scale, 300 sitelinks ≈ 1). */
export function rankFromSitelinks(sl: number | string | undefined): number {
  const n = Number(sl ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, Math.log10(1 + n) / Math.log10(301));
}
