/**
 * Loads card images ahead of time so a landing shows its picture the moment
 * the card opens. Images are fetched into blob URLs (hosts that send CORS
 * headers: Wikimedia, Esri) or, when that is refused, probed through an
 * <img> so the browser's HTTP cache holds them. Either way the image is
 * decoded before it counts as ready, and a failure is reported (null) so the
 * caller can move on to its next choice. A short LRU keeps the last few blobs
 * alive; failures are remembered for a while so they are not retried on
 * every pass.
 */
export class ImageLoader {
  private readonly ready = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly failed = new Map<string, number>();
  private readonly order: string[] = [];

  constructor(
    private readonly keep = 24,
    private readonly retryAfterMs = 10 * 60_000,
  ) {}

  /**
   * Fetch and decode `url`; resolves to a src the <img> can use, or null when
   * the image will not load. The same URL is fetched once.
   */
  ensure(url: string): Promise<string | null> {
    const hit = this.ready.get(url);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(url);
    if (inflight) return inflight;
    const failedAt = this.failed.get(url);
    if (failedAt !== undefined && Date.now() - failedAt < this.retryAfterMs) return Promise.resolve(null);
    const task = this.fetchAndDecode(url).then((src) => {
      this.pending.delete(url);
      if (src) {
        this.failed.delete(url);
        this.remember(url, src);
      } else {
        this.failed.set(url, Date.now());
      }
      return src;
    });
    this.pending.set(url, task);
    return task;
  }

  /** Resolve to a src the <img> can use — the raw URL when preloading failed. */
  async load(url: string): Promise<string> {
    return (await this.ensure(url)) ?? url;
  }

  prefetch(url: string): void {
    void this.ensure(url);
  }

  /** Drop a cached entry (e.g. after the <img> failed on it) and mark it failed. */
  forget(url: string): void {
    const src = this.ready.get(url);
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    this.ready.delete(url);
    this.failed.set(url, Date.now());
  }

  private async fetchAndDecode(url: string): Promise<string | null> {
    if (typeof fetch !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return url;
    let res: Response | null = null;
    try {
      res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
    } catch {
      // No CORS on this host (Smithsonian GVP) or offline: let an <img> try.
      return (await decodes(url)) ? url : null;
    }
    if (!res.ok) return null; // 400 (bad thumbnail width), 404, 429…
    try {
      const blob = await res.blob();
      if (blob.size === 0 || !blob.type.startsWith("image/")) return null;
      const src = URL.createObjectURL(blob);
      if (await decodes(src)) return src;
      URL.revokeObjectURL(src);
    } catch {
      // unreadable body
    }
    return null;
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

/** Load and decode an image off-screen; true when it is a usable picture. */
function decodes(src: string): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(true);
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  img.decoding = "async";
  img.src = src;
  return img
    .decode()
    .then(() => img.naturalWidth > 1)
    .catch(() => false);
}
