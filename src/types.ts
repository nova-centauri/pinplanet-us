export type Continent =
  | "africa"
  | "antarctica"
  | "asia"
  | "europe"
  | "north-america"
  | "oceania"
  | "south-america";

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
}

export interface Pin {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
  fact: string;
  storyUrl: string;
  storyLabel: string;
  added: string;
  continent: Continent;
  imageUrl: string;
}
