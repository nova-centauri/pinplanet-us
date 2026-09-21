import { continentLabel } from "./pins";
import { formatYear } from "./otd";
import type { Pin } from "./types";

const thumbCache = new Map<string, string | null>();

export interface ShowOptions {
  today?: boolean;
}

/** Everything HTML: the card, the status bar, the dock, the toast, the leader line. */
export class Hud {
  private readonly card = el<HTMLElement>("card");
  private readonly title = el<HTMLHeadingElement>("card-title");
  private readonly fact = el<HTMLParagraphElement>("card-fact");
  private readonly category = el<HTMLElement>("card-category");
  private readonly badges = el<HTMLElement>("card-badges");
  private readonly meta = el<HTMLElement>("card-meta");
  private readonly credit = el<HTMLElement>("card-credit");
  private readonly link = el<HTMLAnchorElement>("card-link");
  private readonly image = el<HTMLImageElement>("card-image");
  private readonly media = el<HTMLElement>("card-media");
  private readonly coordLg = el<HTMLElement>("card-coord-lg");
  private readonly continentLg = el<HTMLElement>("card-continent-lg");
  private readonly statusMode = el<HTMLElement>("status-mode");
  private readonly statusHop = el<HTMLElement>("status-hop");
  private readonly statusClock = el<HTMLElement>("status-clock");
  private readonly statusPins = el<HTMLElement>("status-pins");
  private readonly statusTheme = el<HTMLElement>("status-theme");
  private readonly led = el<HTMLElement>("led");
  private readonly toastEl = el<HTMLElement>("toast");
  private readonly leader = el<SVGSVGElement & HTMLElement>("leader");
  private readonly leaderPath = el<SVGPathElement & HTMLElement>("leader-path");
  private readonly leaderDot = el<SVGCircleElement & HTMLElement>("leader-dot");
  private readonly pauseBtn = el<HTMLButtonElement>("pause");
  private request = 0;
  private toastTimer = 0;
  private cardRect: DOMRect | null = null;

  showPin(pin: Pin, opts: ShowOptions = {}): void {
    const token = ++this.request;
    this.title.textContent = pin.title;
    this.fact.textContent = pin.fact;
    this.category.textContent = pin.category;
    this.card.dataset.family = pin.family;

    this.badges.replaceChildren();
    if (pin.live) this.badge("live", pin.source === "wheretheiss" ? "LIVE · MOVING" : "LIVE");
    if (opts.today) this.badge("today", "TODAY IN HISTORY");
    if (pin.flags?.includes("erupting")) this.badge("live", "ERUPTING");
    if (pin.year !== undefined && !pin.live) this.badge("year", formatYear(pin.year));

    this.meta.textContent = `${continentLabel[pin.continent]} · ${fmtCoord(pin.lat, pin.lng)}`;
    this.credit.textContent = pin.credit ? `Text: ${pin.credit}` : "";
    this.coordLg.textContent = fmtCoord(pin.lat, pin.lng);
    this.continentLg.textContent = continentLabel[pin.continent];
    this.link.href = pin.storyUrl;
    this.link.textContent = pin.storyLabel ? `${pin.storyLabel} ↗` : "read the full story ↗";
    this.media.dataset.continent = pin.continent;
    this.image.alt = pin.title;
    this.image.dataset.ok = "false";
    this.image.removeAttribute("src");
    this.card.dataset.open = "true";
    this.cardRect = null;

    void this.loadImage(pin, token);
  }

  hideCard(): void {
    this.card.dataset.open = "false";
    this.leader.dataset.on = "false";
  }

  setMode(auto: boolean, flying: boolean): void {
    this.statusMode.textContent = flying ? "FLYING" : auto ? "AUTO-TOUR" : "PAUSED";
    this.led.dataset.state = flying ? "fly" : auto ? "auto" : "idle";
    this.pauseBtn.textContent = auto ? "Pause" : "Resume";
    this.pauseBtn.dataset.paused = auto ? "false" : "true";
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

  setCounts(total: number, live: number): void {
    this.statusPins.textContent = `${total.toLocaleString()} pins${live ? ` · ${live} live` : ""}`;
  }

  setTheme(name: string): void {
    this.statusTheme.textContent = name;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.on = "true";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.dataset.on = "false";
    }, 1800);
  }

  /**
   * Draw the leader line from the active pin (screen px) to the card.
   * Pass visible=false when the pin is behind the globe or the card is closed.
   */
  updateLeader(x: number, y: number, visible: boolean): void {
    if (!visible || this.card.dataset.open !== "true") {
      this.leader.dataset.on = "false";
      return;
    }
    if (!this.cardRect) this.cardRect = this.card.getBoundingClientRect();
    const r = this.cardRect;
    if (r.width === 0) {
      this.leader.dataset.on = "false";
      return;
    }
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      this.leader.dataset.on = "false";
      return;
    }
    let ax: number;
    let ay: number;
    let cx: number;
    let cy: number;
    if (y < r.top - 8) {
      ax = Math.min(r.right - 28, Math.max(r.left + 28, x));
      ay = r.top;
      cx = ax;
      cy = y;
    } else {
      ax = x > r.right ? r.right : r.left;
      ay = Math.min(r.bottom - 20, Math.max(r.top + 20, y));
      cx = x;
      cy = ay;
    }
    this.leaderPath.setAttribute("d", `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}`);
    this.leaderDot.setAttribute("cx", x.toFixed(1));
    this.leaderDot.setAttribute("cy", y.toFixed(1));
    this.leader.dataset.on = "true";
  }

  invalidateLayout(): void {
    this.cardRect = null;
  }

  private badge(kind: string, text: string): void {
    const b = document.createElement("span");
    b.className = "badge";
    b.dataset.kind = kind;
    b.textContent = text;
    this.badges.appendChild(b);
  }

  private async loadImage(pin: Pin, token: number): Promise<void> {
    const src = sharpen(pin.imageUrl) || (await wikiThumb(pin));
    if (token !== this.request || !src) return;
    this.image.onload = () => {
      if (token === this.request) this.image.dataset.ok = "true";
    };
    this.image.onerror = () => {
      if (token === this.request) this.image.dataset.ok = "false";
    };
    this.image.referrerPolicy = "no-referrer";
    this.image.src = src;
  }
}

/** Ask Wikimedia for a 640px thumb instead of the 320px the API hands out. */
function sharpen(url: string): string {
  if (!url) return "";
  if (/upload\.wikimedia\.org\/.*\/thumb\//.test(url)) return url.replace(/\/(\d{2,4})px-/, "/640px-");
  return url;
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
    const src = data.thumbnail?.source ? sharpen(data.thumbnail.source.split("?")[0]!.replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/")) : null;
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
