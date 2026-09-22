export type Continent =
  | "africa"
  | "antarctica"
  | "asia"
  | "europe"
  | "north-america"
  | "oceania"
  | "south-america";

/** Colour family a pin belongs to; drives marker colour and the card accent. */
export type Family = "nature" | "human" | "live";

/** Raw pin as stored in data/seed-pins.json and public/data/pins.json. */
export interface SeedPin {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
  fact: string;
  story_url: string;
  story_label: string;
  source: string;
  added: string;
  continent?: Continent;
  image_url?: string;
  year?: number;
  day?: string;
  credit?: string;
  rank?: number;
  flags?: string[];
}

/** Pin as used by the app. */
export interface Pin {
  id: string;
  title: string;
  category: string;
  family: Family;
  lat: number;
  lng: number;
  fact: string;
  storyUrl: string;
  storyLabel: string;
  source: string;
  added: string;
  continent: Continent;
  imageUrl: string;
  credit: string;
  rank: number; // 0..1
  year?: number; // negative = BCE
  day?: string; // "MM-DD" — lights up as "today in history"
  live?: boolean; // arrived from a live feed
  expires?: number; // epoch ms; live pins leave the pool after this
  flags?: string[];
  /** Live pins can move (ISS): updated in place. */
  when?: number; // epoch ms of the event (quakes, EONET)
}

export const CATEGORY_FAMILY: Record<string, Family> = {
  geography: "nature",
  volcano: "nature",
  impact: "nature",
  fossil: "nature",
  earthquake: "nature",
  "world record": "nature",
  site: "human",
  battle: "human",
  historical: "human",
  ancient: "human",
  shipwreck: "human",
  science: "human",
  event: "human",
  "random fact": "human",
  "random place": "human",
  "current topic": "live",
  "natural disaster": "nature",
};

export function familyOf(category: string, live = false): Family {
  if (live) return "live";
  return CATEGORY_FAMILY[category] ?? "human";
}
