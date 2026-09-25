import {
  CARD_WIDTH,
  isPhotoUrl,
  photoCandidates,
  photoCredit,
  satelliteImage,
  wikipediaRef,
  type PinImage,
  type WikiRef,
} from "./imagery";
import type { Pin } from "./types";

/**
 * Picks the picture a card shows, walking the chain until something loads:
 *
 *   1. the Wikipedia photo cached at build time (pin.imageUrl)
 *   2. a live Wikipedia lookup on the pin's article — its lead image, then the
 *      other photos on the page (maps, flags, logos and icons skipped)
 *   3. the satellite view of the spot — the backup, never the default
 *
 * Every step is actually loaded and decoded before it is accepted, so a
 * resolved image is ready to paint. Results are memoised per pin, which is
 * what makes prefetching work: the tour resolves the next pin while the
 * current card is still up, and the landing reuses that promise.
 */

/** Anything that can fetch + decode an image URL (ImageLoader in the app). */
export interface ImageProbe {
  ensure(url: string): Promise<string | null>;
}

/** Photo URLs from a Wikipedia article, best first. */
export type WikiPhotoLookup = (ref: WikiRef, width: number) => Promise<string[]>;

export interface ResolvedImage extends PinImage {
  /** Where the photo came from — shown in the credit line. */
  via: "cache" | "wikipedia" | "satellite";
}

/** At most this many live-lookup photos are tried before falling back. */
const MAX_LOOKUP_TRIES = 3;

export class PinImageResolver {
  private readonly memo = new Map<string, Promise<ResolvedImage>>();
  private readonly settled = new Map<string, ResolvedImage>();

  constructor(
    private readonly probe: ImageProbe,
    private readonly lookup: WikiPhotoLookup = wikipediaPhotos,
    private readonly keep = 120,
  ) {}

  /** The picture for `pin`, loaded and decoded. Shared by prefetch and landing. */
  resolve(pin: Pin): Promise<ResolvedImage> {
    const hit = this.memo.get(pin.id);
    if (hit) return hit;
    const task = this.walk(pin).then((image) => {
      this.settled.set(pin.id, image);
      return image;
    });
    this.memo.set(pin.id, task);
    this.trim();
    return task;
  }

  /** Start resolving `pin` now (the next stop on the tour). */
  prefetch(pin: Pin): void {
    void this.resolve(pin);
  }

  /** The already-resolved picture, if there is one (no network). */
  peek(pin: Pin): ResolvedImage | undefined {
    return this.settled.get(pin.id);
  }

  /** Forget the result for `pin` (the <img> failed on it after all). */
  invalidate(pin: Pin): void {
    this.memo.delete(pin.id);
    this.settled.delete(pin.id);
  }

  private async walk(pin: Pin): Promise<ResolvedImage> {
    const tried = new Set<string>();

    // 1. The Wikipedia photo the cache builder picked.
    if (pin.imageUrl && isPhotoUrl(pin.imageUrl)) {
      for (const url of photoCandidates(pin.imageUrl, CARD_WIDTH)) {
        tried.add(url);
        if (await this.probe.ensure(url)) return { url, kind: "photo", credit: photoCredit(url), via: "cache" };
      }
    }

    // 2. Ask Wikipedia live.
    const ref = wikipediaRef(pin.storyUrl);
    if (ref) {
      let photos: string[] = [];
      try {
        photos = await this.lookup(ref, CARD_WIDTH);
      } catch {
        photos = [];
      }
      let tries = 0;
      for (const url of photos) {
        if (tried.has(url) || !isPhotoUrl(url)) continue;
        if (tries++ >= MAX_LOOKUP_TRIES) break;
        tried.add(url);
        if (await this.probe.ensure(url)) return { url, kind: "photo", credit: photoCredit(url), via: "wikipedia" };
      }
    }

    // 3. The backup: a satellite view of the spot.
    const sat = satelliteImage(pin);
    await this.probe.ensure(sat.url);
    return { ...sat, via: "satellite" };
  }

  private trim(): void {
    while (this.memo.size > this.keep) {
      const oldest = this.memo.keys().next().value as string;
      this.memo.delete(oldest);
      this.settled.delete(oldest);
    }
  }
}

// ── Wikipedia lookup ────────────────────────────────────────────────────

interface PageImagesResponse {
  query?: {
    pages?: {
      title: string;
      missing?: boolean;
      thumbnail?: { source: string; width?: number; height?: number };
    }[];
  };
}

interface ArticleImagesResponse {
  query?: {
    pages?: {
      title: string;
      index?: number;
      imageinfo?: { url?: string; thumburl?: string; mime?: string; width?: number; height?: number }[];
    }[];
  };
}

const PHOTO_MIME = /^image\/(jpeg|png|webp|tiff)$/;
const lookups = new Map<string, Promise<string[]>>();

/**
 * Photo URLs for a Wikipedia article: the lead image first (what Wikipedia
 * itself shows in previews), then the other photos on the page. Uses the
 * MediaWiki action API with `origin=*` (anonymous CORS). The API rounds
 * `pithumbsize` / `iiurlwidth` up to a standard thumbnail width, so every
 * URL it returns is one upload.wikimedia.org will serve.
 */
export function wikipediaPhotos(ref: WikiRef, width = CARD_WIDTH, fetchJson: FetchJson = defaultFetchJson): Promise<string[]> {
  const key = `${ref.lang}:${ref.title}:${width}`;
  const hit = lookups.get(key);
  if (hit) return hit;
  const task = lookupPhotos(ref, width, fetchJson).catch(() => {
    lookups.delete(key); // transient failure: allow a retry later
    return [] as string[];
  });
  lookups.set(key, task);
  return task;
}

async function lookupPhotos(ref: WikiRef, width: number, fetchJson: FetchJson): Promise<string[]> {
  const api = `https://${ref.lang}.wikipedia.org/w/api.php`;
  const base = { action: "query", format: "json", formatversion: "2", origin: "*", redirects: "1", titles: ref.title };

  const out: string[] = [];
  const lead = await fetchJson<PageImagesResponse>(
    `${api}?${new URLSearchParams({ ...base, prop: "pageimages", piprop: "thumbnail", pithumbsize: String(width) })}`,
  );
  const page = lead.query?.pages?.[0];
  if (!page || page.missing) return out;
  const leadUrl = page.thumbnail?.source;
  if (leadUrl && isPhotoUrl(leadUrl)) {
    out.push(leadUrl);
    return out; // the lead image is a photo: that is the one
  }

  // Lead image is a map / flag / missing: look through the rest of the article.
  const rest = await fetchJson<ArticleImagesResponse>(
    `${api}?${new URLSearchParams({
      ...base,
      generator: "images",
      gimlimit: "50",
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: String(width),
    })}`,
  );
  for (const file of rest.query?.pages ?? []) {
    const info = file.imageinfo?.[0];
    const url = info?.thumburl ?? info?.url;
    if (!info || !url) continue;
    if (info.mime && !PHOTO_MIME.test(info.mime)) continue;
    if (!isPhotoUrl(url)) continue;
    const w = info.width ?? 0;
    const h = info.height ?? 0;
    if (w < 400 || h < 200) continue; // icons and thumbnails of thumbnails
    const aspect = w / h;
    if (aspect > 3.2 || aspect < 0.5) continue; // banners, scans of tall pages
    out.push(url);
  }
  return out;
}

export type FetchJson = <T>(url: string) => Promise<T>;

async function defaultFetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
