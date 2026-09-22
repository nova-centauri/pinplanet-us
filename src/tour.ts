import type { Pin } from "./types";

/**
 * Tour choreography.
 *
 * Hard rule (V1): every jump lands on a different continent than the pin we
 * just left. Soft rules layered on top for a big pool:
 *  - categories are interleaved (a volcano is rarely followed by a volcano)
 *  - each category gets airtime ∝ √(its size), so 700 history pins don't
 *    drown 40 shipwrecks, and 1 event pin doesn't repeat every minute
 *  - fame (rank) nudges, live pins and "today in history" pins get a boost
 *  - continents with fewer pins get a lift, so a Europe-heavy pool doesn't
 *    mean a Europe-heavy tour (capped, so Antarctica's 60 pins don't loop)
 *  - recently shown pins are skipped while alternatives exist
 */

export interface PickOptions {
  today?: string; // "MM-DD"
  now?: number;
  random?: () => number;
}

export function pickNextPin(
  pins: Pin[],
  previous: Pin | null,
  recentIds: readonly string[] = [],
  opts: PickOptions = {},
): Pin {
  if (pins.length === 0) throw new Error("No pins available");
  const random = opts.random ?? Math.random;
  if (!previous) {
    const weighted = pins.map((p) => ({ p, w: 0.4 + p.rank }));
    return sample(weighted, random) ?? pins[0]!;
  }

  const otherContinent = pins.filter((pin) => pin.continent !== previous.continent);
  if (otherContinent.length === 0) {
    throw new Error(`Continent rule: no pin exists on a different continent than ${previous.continent}`);
  }

  const recent = new Set(recentIds);
  const unseen = otherContinent.filter((pin) => !recent.has(pin.id));
  const pool = unseen.length > 0 ? unseen : otherContinent;

  const counts = new Map<string, number>();
  const continents = new Map<string, number>();
  for (const pin of pool) {
    counts.set(pin.category, (counts.get(pin.category) ?? 0) + 1);
    continents.set(pin.continent, (continents.get(pin.continent) ?? 0) + 1);
  }
  const meanPerContinent = pool.length / Math.max(1, continents.size);

  const now = opts.now ?? Date.now();
  const weighted = pool.map((pin) => ({ p: pin, w: weightOf(pin, previous, counts, continents, meanPerContinent, opts.today, now) }));
  return sample(weighted, random) ?? pool[Math.floor(random() * pool.length)]!;
}

function weightOf(
  pin: Pin,
  previous: Pin,
  counts: Map<string, number>,
  continents: Map<string, number>,
  meanPerContinent: number,
  today: string | undefined,
  now: number,
): number {
  const n = counts.get(pin.category) ?? 1;
  // Category airtime ∝ sqrt(size): each pin's share is sqrt(n)/n.
  let w = Math.sqrt(n) / n;
  w *= 0.55 + 0.9 * pin.rank;
  w *= continentLift(continents.get(pin.continent) ?? 1, meanPerContinent);
  if (pin.category === previous.category) w *= 0.12;
  if (pin.family === previous.family) w *= 0.7;
  if (today && pin.day === today) w *= 6;
  if (pin.live) {
    const ageH = pin.when ? (now - pin.when) / 3_600_000 : 48;
    w *= ageH < 6 ? 5 : ageH < 24 ? 3 : 1.8;
  }
  return w;
}

/** Pins on thin continents count for more; clamped so a tiny continent can't loop. */
export function continentLift(count: number, mean: number): number {
  return Math.min(2.5, Math.max(0.35, (mean / Math.max(1, count)) ** 0.7));
}

function sample<T>(items: { p: T; w: number }[], random: () => number): T | null {
  let total = 0;
  for (const it of items) total += it.w;
  if (!(total > 0)) return null;
  let r = random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.p;
  }
  return items[items.length - 1]?.p ?? null;
}

export function assertContinentHop(from: Pin, to: Pin): void {
  if (from.continent === to.continent) {
    throw new Error(`Illegal hop ${from.id} → ${to.id}: both on ${from.continent}`);
  }
}

/** Seconds to linger on a card: enough to read the fact, never a slog. */
export function dwellFor(pin: Pin): number {
  const chars = pin.fact.length + pin.title.length * 0.5;
  return Math.min(12, Math.max(5.5, 3.6 + chars * 0.03));
}
