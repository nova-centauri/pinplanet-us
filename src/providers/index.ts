import type { Pin } from "../types";
import { fetchEonet } from "./eonet";
import { IssTracker } from "./iss";
import { fetchToday } from "./today";
import { fetchQuakes } from "./usgs";
import { readStore, writeStore } from "./store";

/**
 * Live providers. Each one: fetch() → Pin[], a TTL for its pins, and a
 * cadence. Results are cached in localStorage so a reload is instant and a
 * dead network degrades to "slightly stale", never to "broken".
 */

export interface Provider {
  id: string;
  label: string;
  cadenceMs: number; // how often to poll while the page is open
  staleMs: number; // how long a stored result may be reused on load
  fetch: () => Promise<Pin[]>;
}

export interface ProviderEvent {
  provider: Provider;
  pins: Pin[];
  fromCache: boolean;
}

export const providers: Provider[] = [
  { id: "usgs", label: "USGS earthquakes", cadenceMs: 15 * 60_000, staleMs: 15 * 60_000, fetch: fetchQuakes },
  { id: "eonet", label: "NASA EONET", cadenceMs: 60 * 60_000, staleMs: 60 * 60_000, fetch: fetchEonet },
  { id: "today", label: "Wikipedia · today in history", cadenceMs: 6 * 3_600_000, staleMs: 6 * 3_600_000, fetch: fetchToday },
];

export { IssTracker };

/**
 * Start every provider: emit cached pins immediately, then refresh on its
 * own cadence. `onPins` receives fresh batches; pins carry their own expiry.
 */
export function startProviders(onPins: (event: ProviderEvent) => void): () => void {
  const timers: number[] = [];
  for (const provider of providers) {
    const key = `provider:${provider.id}`;
    const stored = readStore<Pin[]>(key, provider.staleMs * 4);
    if (stored && stored.length) onPins({ provider, pins: stored.filter((p) => !p.expires || p.expires > Date.now()), fromCache: true });

    const run = async (): Promise<void> => {
      if (document.visibilityState === "hidden") return;
      try {
        const pins = await provider.fetch();
        writeStore(key, pins);
        onPins({ provider, pins, fromCache: false });
      } catch (err) {
        console.warn(`[pinplanet] ${provider.label} failed`, err);
      }
    };

    const freshEnough = stored && Date.now() - (readStoreAt(key) ?? 0) < provider.staleMs;
    const first = window.setTimeout(() => void run(), freshEnough ? provider.staleMs / 2 : 400 + timers.length * 900);
    timers.push(first);
    timers.push(window.setInterval(() => void run(), provider.cadenceMs));
  }
  return () => timers.forEach((t) => window.clearTimeout(t));
}

function readStoreAt(key: string): number | null {
  try {
    const raw = localStorage.getItem(`pinplanet:v2:${key}`);
    if (!raw) return null;
    return (JSON.parse(raw) as { at: number }).at ?? null;
  } catch {
    return null;
  }
}
