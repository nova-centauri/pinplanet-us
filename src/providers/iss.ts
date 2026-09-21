import { guessContinent } from "../continent";
import type { Pin } from "../types";

/**
 * Where the International Space Station is right now (wheretheiss.at, CORS
 * enabled, no key). One pin that moves at 7.66 km/s.
 */

const API = "https://api.wheretheiss.at/v1/satellites/25544";
export const ISS_ID = "iss-live";

interface IssState {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  timestamp: number;
}

export class IssTracker {
  private timer: number | null = null;
  private failures = 0;

  constructor(private readonly onUpdate: (pin: Pin) => void, private readonly everyMs = 12_000) {}

  start(): void {
    if (this.timer !== null) return;
    void this.tick();
    this.timer = window.setInterval(() => void this.tick(), this.everyMs);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (document.visibilityState === "hidden") return;
    if (this.failures > 6) return; // give up quietly; the globe never looks broken
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error(`ISS ${res.status}`);
      const s = (await res.json()) as IssState;
      this.failures = 0;
      this.onUpdate(toPin(s));
    } catch {
      this.failures += 1;
    }
  }
}

function toPin(s: IssState): Pin {
  const lat = s.latitude;
  const lng = s.longitude;
  const kmh = Math.round(s.velocity).toLocaleString();
  const alt = Math.round(s.altitude);
  const fact = `The International Space Station is over this point right now, ${alt} km up and moving at ${kmh} km/h — one lap of the planet every 93 minutes, 16 sunrises a day. It is in ${s.visibility === "daylight" ? "sunlight" : "Earth's shadow"} at this moment.`;
  return {
    id: ISS_ID,
    title: "International Space Station",
    category: "science",
    family: "live",
    lat,
    lng,
    fact,
    storyUrl: "https://en.wikipedia.org/wiki/International_Space_Station",
    storyLabel: "Wikipedia: International Space Station",
    source: "wheretheiss",
    added: new Date(s.timestamp * 1000).toISOString().slice(0, 10),
    continent: guessContinent(lat, lng),
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/640px-International_Space_Station_after_undocking_of_STS-132.jpg",
    credit: "Where the ISS at? · NASA",
    rank: 0.9,
    live: true,
    when: s.timestamp * 1000,
    year: new Date(s.timestamp * 1000).getUTCFullYear(),
  };
}
