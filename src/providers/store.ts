/** Tiny localStorage cache with TTL so repeat visits are instant and offline never looks broken. */

const PREFIX = "pinplanet:v2:";

export interface Stored<T> {
  at: number;
  data: T;
}

export function readStore<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeStore<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies Stored<T>));
  } catch {
    // Quota or private mode: fine, we just refetch next time.
  }
}

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + "setting:" + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + "setting:" + key, value);
  } catch {
    // ignore
  }
}
