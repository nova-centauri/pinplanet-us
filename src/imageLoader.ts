/**
 * Loads card images ahead of time so a landing shows its picture the moment
 * the card opens. Images are fetched into blob URLs (hosts that send CORS
 * headers: Wikimedia, Esri) or, when that is refused, left for the <img>
 * to load directly. A short LRU keeps the last few blobs alive.
 */
export class ImageLoader {
  private readonly ready = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly order: string[] = [];

  constructor(private readonly keep = 14) {}

  /** Resolve to a src the <img> can use; the same URL is fetched once. */
  load(url: string): Promise<string> {
    const hit = this.ready.get(url);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(url);
    if (inflight) return inflight;
    const task = this.fetchToBlob(url).then((src) => {
      this.remember(url, src);
      this.pending.delete(url);
      return src;
    });
    this.pending.set(url, task);
    return task;
  }

  prefetch(url: string): void {
    void this.load(url);
  }

  /** Drop a cached entry (e.g. after the <img> failed on it). */
  forget(url: string): void {
    const src = this.ready.get(url);
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    this.ready.delete(url);
  }

  private async fetchToBlob(url: string): Promise<string> {
    if (typeof fetch !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return url;
    try {
      const res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
      if (!res.ok) return url;
      const blob = await res.blob();
      if (blob.size > 0 && blob.type.startsWith("image/")) return URL.createObjectURL(blob);
    } catch {
      // No CORS on this host (Smithsonian GVP) or offline: let the <img> try.
    }
    return url;
  }

  private remember(url: string, src: string): void {
    this.ready.set(url, src);
    this.order.push(url);
    while (this.order.length > this.keep) {
      const old = this.order.shift()!;
      if (old === url) continue;
      const s = this.ready.get(old);
      this.ready.delete(old);
      if (s?.startsWith("blob:")) URL.revokeObjectURL(s);
    }
  }
}
