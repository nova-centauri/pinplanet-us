import { continentLabel } from "./pins";
import type { Pin } from "./types";

export class Hud {
  private readonly card = el<HTMLElement>("card");
  private readonly title = el<HTMLHeadingElement>("card-title");
  private readonly fact = el<HTMLParagraphElement>("card-fact");
  private readonly category = el<HTMLElement>("card-category");
  private readonly meta = el<HTMLElement>("card-meta");
  private readonly link = el<HTMLAnchorElement>("card-link");
  private readonly image = el<HTMLImageElement>("card-image");
  private readonly media = el<HTMLElement>("card-media");
  private readonly statusMode = el<HTMLElement>("status-mode");
  private readonly statusHop = el<HTMLElement>("status-hop");
  private readonly led = el<HTMLElement>("led");

  showPin(pin: Pin): void {
    this.title.textContent = pin.title;
    this.fact.textContent = pin.fact;
    this.category.textContent = pin.category;
    this.meta.textContent = `${continentLabel[pin.continent]} · ${pin.added} · ${fmtCoord(pin.lat, pin.lng)}`;
    this.link.href = pin.storyUrl;
    this.link.textContent = pin.storyLabel ? `${pin.storyLabel} ↗` : "read the full story ↗";
    this.media.dataset.continent = pin.continent;
    this.image.alt = pin.title;
    this.image.src = pin.imageUrl;
    this.image.onload = () => {
      this.image.dataset.ok = "true";
    };
    this.image.onerror = () => {
      this.image.removeAttribute("src");
      this.image.dataset.ok = "false";
    };
    this.image.dataset.ok = "false";
    this.card.dataset.open = "true";
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
      this.statusHop.textContent = `· ${continentLabel[to.continent]}`;
      return;
    }
    this.statusHop.textContent = `· ${continentLabel[from.continent]} → ${continentLabel[to.continent]}`;
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
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lng).toFixed(2)}°${ew}`;
}
