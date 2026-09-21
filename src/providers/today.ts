import { guessContinent } from "../continent";
import { candidatesForDay, otdFact, pickCandidates, todayKey, type OtdEvent } from "../otd";
import type { Pin } from "../types";

/**
 * Wikipedia "On this day" for today, live. The cache already holds two
 * events per calendar day; this adds a few more for today so the "today in
 * history" set is fresh even when the cache is months old.
 */

const MAX = 8;

export async function fetchToday(): Promise<Pin[]> {
  const day = todayKey();
  const [mm, dd] = day.split("-");
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`On this day ${res.status}`);
  const data = (await res.json()) as { events: OtdEvent[] };
  const cands = candidatesForDay(data.events ?? []).filter((c) => c.text.length >= 40);
  const pins: Pin[] = [];
  for (const c of pickCandidates(cands, MAX, 2)) {
    pins.push({
      id: `today-${day}-${slug(`${c.year}-${c.title}`)}`,
      title: c.title,
      category: "historical",
      family: "human",
      lat: c.lat,
      lng: c.lng,
      fact: otdFact(c.year, c.text),
      storyUrl: c.url,
      storyLabel: `Wikipedia: ${c.title}`,
      source: "wikipedia-otd",
      added: new Date().toISOString().slice(0, 10),
      continent: guessContinent(c.lat, c.lng),
      imageUrl: c.image ?? "",
      credit: "Wikipedia · CC BY-SA 4.0",
      rank: Math.min(1, 0.45 + c.score * 0.08),
      year: c.year,
      day,
      live: true,
      expires: endOfToday(),
      when: Date.now(),
    });
  }
  return pins;
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
