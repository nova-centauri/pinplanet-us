import { readStore, writeStore } from "./providers/store";

/**
 * Where the tour has been. A visit log with a browser-style cursor: new
 * visits append at the end; Back and Forward move the cursor without
 * appending, so pressing Back repeatedly walks the real history instead of
 * bouncing between two pins. Persisted, so yesterday's pins are still there.
 */

export interface Visit {
  id: string;
  at: number; // epoch ms
}

export interface VisitStore {
  read(): Visit[] | null;
  write(entries: Visit[]): void;
}

const KEY = "history";
const KEEP_MS = 30 * 86_400_000;

export const localVisitStore: VisitStore = {
  read: () => readStore<Visit[]>(KEY, KEEP_MS),
  write: (entries) => writeStore(KEY, entries),
};

export class History {
  readonly entries: Visit[] = [];
  cursor = -1;
  private readonly listeners: (() => void)[] = [];

  constructor(
    private readonly max = 80,
    private readonly store: VisitStore | null = null,
  ) {
    const stored = store?.read();
    if (stored?.length) {
      const valid = stored.filter((v) => v && typeof v.id === "string" && typeof v.at === "number");
      this.entries.push(...valid.slice(-max));
    }
  }

  get current(): Visit | null {
    return this.entries[this.cursor] ?? null;
  }

  get canBack(): boolean {
    return this.cursor > 0;
  }

  get canForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.entries.length - 1;
  }

  /** Record arriving at a pin (auto-tour, click, breaking news). */
  push(id: string, at = Date.now()): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.id === id && this.cursor === this.entries.length - 1) {
      last.at = at;
      this.persist();
      this.emit();
      return;
    }
    this.entries.push({ id, at });
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
    this.cursor = this.entries.length - 1;
    this.persist();
    this.emit();
  }

  back(): Visit | null {
    if (!this.canBack) return null;
    this.cursor -= 1;
    return this.touch();
  }

  forward(): Visit | null {
    if (!this.canForward) return null;
    this.cursor += 1;
    return this.touch();
  }

  goto(index: number): Visit | null {
    if (index < 0 || index >= this.entries.length) return null;
    this.cursor = index;
    return this.touch();
  }

  /** Ids of the last n visits, oldest → newest (the tour's "recently shown" list). */
  recentIds(n: number): string[] {
    return this.entries.slice(-n).map((v) => v.id);
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private touch(): Visit | null {
    const visit = this.current;
    if (visit) visit.at = Date.now();
    this.persist();
    this.emit();
    return visit;
  }

  private persist(): void {
    this.store?.write(this.entries);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

/** "just now", "4 min ago", "2 h ago", "yesterday", "5 days ago". */
export function agoLabel(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 45) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.max(1, Math.round(m))} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} h ago`;
  const d = h / 24;
  if (d < 1.5) return "yesterday";
  return `${Math.round(d)} days ago`;
}
