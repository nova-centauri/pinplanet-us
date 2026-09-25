import { agoLabel, type History, type Visit } from "./history";
import { imageFor, satelliteImage } from "./imagery";
import { continentLabel } from "./pins";
import type { Pin } from "./types";

const MAX_ROWS = 60;

/**
 * The "Visited" panel: every pin the tour has landed on, newest first, with a
 * thumbnail and how long ago. Clicking a row flies back to it. Renders only
 * while open (thumbnails are real requests), and re-renders on change.
 */
export class HistoryPanel {
  private readonly root = el<HTMLElement>("history");
  private readonly list = el<HTMLOListElement>("history-list");
  private readonly count = el<HTMLElement>("history-count");
  private readonly backBtn = el<HTMLButtonElement>("back");
  private readonly fwdBtn = el<HTMLButtonElement>("fwd");
  /** One row per visit, kept across renders so thumbnails are not refetched. */
  private readonly rows = new WeakMap<Visit, HTMLLIElement>();
  private clock = 0;

  constructor(
    private readonly history: History,
    private readonly resolve: (id: string) => Pin | undefined,
    onPick: (pin: Pin) => void,
    onStep: (direction: -1 | 1) => void,
    /** Thumbnail URL for a row (the card's resolved picture when known) and its satellite fallback. */
    private readonly thumbFor: (pin: Pin) => { url: string; fallback: string } = defaultThumb,
  ) {
    history.onChange(() => {
      if (this.open) this.render();
      else this.updateNav();
    });
    this.list.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
      if (!button) return;
      const pin = this.resolve(button.dataset.id ?? "");
      if (pin) onPick(pin);
    });
    this.backBtn.addEventListener("click", () => onStep(-1));
    this.fwdBtn.addEventListener("click", () => onStep(1));
    el("history-close").addEventListener("click", () => this.toggle(false));
    this.updateNav();
  }

  get open(): boolean {
    return this.root.dataset.open === "true";
  }

  toggle(open = !this.open): boolean {
    this.root.dataset.open = String(open);
    if (open) {
      this.render();
      // Keep "2 min ago" honest while the panel stays open.
      this.clock = window.setInterval(() => this.render(), 30_000);
    } else {
      window.clearInterval(this.clock);
    }
    return open;
  }

  render(): void {
    const now = Date.now();
    const rows: HTMLElement[] = [];
    const entries = this.history.entries;
    let shown = 0;
    for (let i = entries.length - 1; i >= 0 && shown < MAX_ROWS; i--) {
      const visit = entries[i]!;
      const pin = this.resolve(visit.id);
      if (!pin) continue;
      shown += 1;
      const li = this.rows.get(visit) ?? this.makeRow(visit, pin);
      li.dataset.current = String(i === this.history.cursor);
      const meta = li.querySelector(".history-meta");
      if (meta) meta.textContent = `${pin.category} · ${continentLabel[pin.continent]} · ${agoLabel(now - visit.at)}`;
      rows.push(li);
    }
    this.list.replaceChildren(...rows);
    this.count.textContent = shown ? String(shown) : "";
    this.root.dataset.empty = String(shown === 0);
    this.updateNav();
  }

  private makeRow(visit: Visit, pin: Pin): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "history-item";
    li.dataset.family = pin.family;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = pin.id;
    button.title = `Fly back to ${pin.title}`;

    const thumb = document.createElement("img");
    thumb.className = "history-thumb";
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.referrerPolicy = "no-referrer";
    const { url, fallback } = this.thumbFor(pin);
    thumb.src = url;
    thumb.onerror = () => {
      // A photo that will not load → the satellite view, once.
      if (thumb.src !== fallback) thumb.src = fallback;
      thumb.onerror = null;
    };

    const text = document.createElement("span");
    text.className = "history-text";
    const name = document.createElement("span");
    name.className = "history-name";
    name.textContent = pin.title;
    const meta = document.createElement("span");
    meta.className = "history-meta";
    text.append(name, meta);
    button.append(thumb, text);
    li.appendChild(button);
    this.rows.set(visit, li);
    return li;
  }

  private updateNav(): void {
    this.backBtn.disabled = !this.history.canBack;
    this.fwdBtn.disabled = !this.history.canForward;
  }
}

function defaultThumb(pin: Pin): { url: string; fallback: string } {
  const size = { width: 160, height: 100 };
  return { url: imageFor(pin, size).url, fallback: satelliteImage(pin, size).url };
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}
