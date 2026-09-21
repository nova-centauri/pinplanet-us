import type { Pin } from "./types";

/**
 * Hard V1 rule: every jump lands on a different continent than the pin
 * we just left. Recent IDs are only a variety hint — they never override
 * the continent constraint.
 */
export function pickNextPin(
  pins: Pin[],
  previous: Pin | null,
  recentIds: readonly string[] = [],
): Pin {
  if (pins.length === 0) {
    throw new Error("No pins available");
  }
  if (!previous) {
    return pins[Math.floor(Math.random() * pins.length)]!;
  }

  const otherContinent = pins.filter((pin) => pin.continent !== previous.continent);
  if (otherContinent.length === 0) {
    throw new Error(
      `Continent rule: no pin exists on a different continent than ${previous.continent}`,
    );
  }

  const unseen = otherContinent.filter((pin) => !recentIds.includes(pin.id));
  const pool = unseen.length > 0 ? unseen : otherContinent;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function assertContinentHop(from: Pin, to: Pin): void {
  if (from.continent === to.continent) {
    throw new Error(
      `Illegal hop ${from.id} → ${to.id}: both on ${from.continent}`,
    );
  }
}
