import { continentLabel } from "./pins";
import type { Pin } from "./types";

const thumbCache = new Map<string, string | null>();

export class Hud {
  private readonly card = el<HTMLElement>("card");
  private readonly title = el<HTMLHeadingElement>("card-title");
  private readonly fact = el<HTMLParagraphElement>("card-fact");
  private readonly category = el<HTMLElement>("card-category");
  private readonly meta = el<HTMLElement>("card-meta");
  private readonly link = el<HTMLAnchorElement>("card-link");
  private readonly image = el<HTMLImageElement>("card-image");
  private readonly media = el<HTMLElement>("card-media");
  private readonly coordLg = el<HTMLElement>("card-coord-lg");
  private readonly continentLg = el<HTMLElement>("card-continent-lg");
  private readonly statusMode = el<HTMLElement>("status-mode");
  private readonly statusHop = el<HTMLElement>("status-hop");
  private readonly statusClock = el<HTMLElement>("status-clock");
  private readonly led = el<HTMLElement>("led");
  private request = 0;

  showPin(pin: Pin): void {
    const token = ++this.request;
    this.title.textContent = pin.title;
    this.fact.textContent = pin.fact;
    this.category.textContent = pin.category;
    this.meta.textContent = `${continentLabel[pin.continent]} · ${pin.added}`;
    this.coordLg.textContent = fmtCoord(pin.lat, pin.lng);
    this.continentLg.textContent = continentLabel[pin.continent];
    this.link.href = pin.storyUrl;
    this.link.textContent = pin.storyLabel ? `${pin.storyLabel} ↗` : "read the full story ↗";
    this.media.dataset.continent = pin.continent;
    this.image.alt = pin.title;
    this.image.dataset.ok = "false";
    this.image.removeAttribute("src");
    this.card.dataset.open = "true";

    void this.loadImage(pin, token);
  }

  hideCard(): void {
    this.card.dataset.open = "false";
  }

  setMode(auto: boolean, flying: boolean): void {
    this.statusMode.textContent = flying ? "FLYING" : auto ? "AUTO-TOUR" : "PAUSED";
    this.led.dataset.state = flying ? "fly" : auto ? "auto" : "idle";
  }

  setHop(from: Pin | null, to: Pin | null): void {
    if (!to) {
      this.statusHop.textContent = "";
      return;
    }
    if (!from) {
      this.statusHop.textContent = continentLabel[to.continent];
      return;
    }
    this.statusHop.textContent = `${continentLabel[from.continent]} → ${continentLabel[to.continent]}`;
  }

  setClock(seconds: number | null): void {
    if (seconds === null) {
      this.statusClock.textContent = "——.—";
      return;
    }
    this.statusClock.textContent = seconds.toFixed(1).padStart(4, "0");
  }

  private async loadImage(pin: Pin, token: number): Promise<void> {
    const src = pin.imageUrl || (await wikiThumb(pin));
    if (token !== this.request || !src) return;
    this.image.onload = () => {
      if (token === this.request) this.image.dataset.ok = "true";
    };
    this.image.onerror = () => {
      if (token === this.request) this.image.dataset.ok = "false";
    };
    this.image.src = src;
  }
}

async function wikiThumb(pin: Pin): Promise<string | null> {
  if (thumbCache.has(pin.id)) return thumbCache.get(pin.id) ?? null;
  const slug = pin.storyUrl.split("/wiki/")[1];
  if (!slug) {
    thumbCache.set(pin.id, null);
    return null;
  }
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (!res.ok) {
      thumbCache.set(pin.id, null);
      return null;
    }
    const data = (await res.json()) as { thumbnail?: { source?: string } };
    const src = data.thumbnail?.source ?? null;
    thumbCache.set(pin.id, src);
    return src;
  } catch {
    thumbCache.set(pin.id, null);
    return null;
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

function fmtCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lng).toFixed(2)}°${ew}`;
}
