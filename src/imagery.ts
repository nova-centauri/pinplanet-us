import type { Pin } from "./types";

/**
 * Every pin shows a picture. Order of preference (see pinImage.ts, which
 * walks this chain at runtime and prefetches it before the camera arrives):
 *   1. the Wikipedia photo cached at build time — the article's lead image,
 *      Wikidata's P18 image, or the Smithsonian GVP photo (image_url)
 *   2. a live Wikipedia lookup — the article's lead image, then the other
 *      photos on the article — when there is no cached photo or it fails
 *   3. a satellite view of the spot, the backup — Esri World Imagery by
 *      default, Google Static Maps when VITE_GOOGLE_MAPS_KEY is configured
 *
 * Wikimedia only serves hotlinked thumbnails at its standard widths (see
 * THUMB_STEPS); any other width is refused with HTTP 400, so every size we
 * ask for is snapped to a step.
 *
 * Maps, flags, logos, diagrams and shakemaps count as "no photo": a 640 px
 * render of a locator map is worse than a satellite view of the place, so
 * the classifier below rejects them (shared by the cache builder and the app).
 */

export type ImageKind = "photo" | "satellite";

/**
 * The only thumbnail widths upload.wikimedia.org serves to direct requests
 * (https://www.mediawiki.org/wiki/Common_thumbnail_sizes). Anything else is a
 * 400 "Use thumbnail sizes listed on https://w.wiki/GHai".
 */
export const THUMB_STEPS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840] as const;

/** Card photos: 960 px covers a 2× card and is what the cache stores. */
export const CARD_WIDTH = 960;

export interface PinImage {
  url: string;
  kind: ImageKind;
  /** Short attribution shown over the image. */
  credit: string;
}

export const SATELLITE_CREDIT = "Esri, Maxar, Earthstar Geographics";
export const GOOGLE_CREDIT = "Google";

const ESRI_EXPORT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";
const EARTH_RADIUS = 6378137;
const MAX_MERCATOR_LAT = 85.05;

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
/** Optional: a Google Static Maps key (referrer-restricted) switches the satellite provider. */
export const GOOGLE_MAPS_KEY = env.VITE_GOOGLE_MAPS_KEY ?? "";

const NON_PHOTO_EXT = /\.(svg|gif|pdf|djvu|webm|ogv|ogg|oga|mid|midi|xcf|stl)(\.(png|jpe?g))?$/i;
const NON_PHOTO_TOKENS = new Set([
  "map",
  "maps",
  "karte",
  "mapa",
  "carte",
  "mappa",
  "locator",
  "location",
  "logo",
  "logos",
  "flag",
  "flags",
  "emblem",
  "wappen",
  "escudo",
  "bandera",
  "blason",
  "shakemap",
  "diagram",
  "chart",
  "plan",
  "plans",
  "schematic",
  "scheme",
  "blank",
  "coa",
  "orthographic",
  "topographic",
  "topo",
  "isoseismal",
  "intensity",
  "icon",
  "symbol",
  "pictogram",
  "signature",
  "banner",
]);

/** Filename of an image URL, decoded, without Wikimedia's thumbnail prefix. */
export function imageFileName(url: string): string {
  let name = url.split("?")[0]!;
  name = name.slice(name.lastIndexOf("/") + 1);
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw name
  }
  return name.replace(/^(lossy-|lossless-)?(page\d+-)?\d{2,4}px-/, "");
}

/** True when the URL looks like a photograph rather than a map, flag, logo or diagram. */
export function isPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const name = imageFileName(url);
  if (!name) return false;
  if (NON_PHOTO_EXT.test(name)) return false;
  if (/coat[_ -]of[_ -]arms|great[_ -]seal|seal[_ -]of[_ -]/i.test(name)) return false;
  const stem = name.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  for (const token of stem.split(/[^a-z0-9]+/)) {
    if (NON_PHOTO_TOKENS.has(token)) return false;
  }
  return true;
}

/**
 * A satellite view centred on a point, sized like a card image. Zoom uses
 * Web Mercator tile semantics (15 ≈ a few km across at 640 px).
 */
export function satelliteUrl(lat: number, lng: number, zoom: number, width = 640, height = 360): string {
  if (GOOGLE_MAPS_KEY) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(5)},${lng.toFixed(5)}&zoom=${zoom}&size=${width}x${height}&maptype=satellite&key=${encodeURIComponent(GOOGLE_MAPS_KEY)}`;
  }
  const unit = 156543.03392804097 / 2 ** zoom; // projected metres per pixel
  const { x, y } = mercator(lat, lng);
  const hw = (width / 2) * unit;
  const hh = (height / 2) * unit;
  const bbox = [x - hw, y - hh, x + hw, y + hh].map((v) => v.toFixed(1)).join(",");
  return `${ESRI_EXPORT}?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=${width},${height}&format=jpg&f=image`;
}

export function mercator(lat: number, lng: number): { x: number; y: number } {
  const phi = (Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)) * Math.PI) / 180;
  return {
    x: (EARTH_RADIUS * lng * Math.PI) / 180,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  };
}

export function inverseMercator(x: number, y: number): { lat: number; lng: number } {
  return {
    lng: ((x / EARTH_RADIUS) * 180) / Math.PI,
    lat: ((2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180) / Math.PI,
  };
}

const CLOSE_UP =
  /\b(falls?|waterfall|cave|cavern|grotto|geyser|spring|arch|sinkhole|cenote|blue hole|crater|lighthouse|bridge|dam|tower|statue|castle|cathedral|mosque|temple|palace|pyramid|stadium|monument|memorial|church|abbey|fort|fortress|observatory|telescope)\b/i;
const WIDE =
  /\b(lake|glacier|desert|canyon|island|islands|national park|reef|atoll|fjord|valley|forest|range|plateau|dunes?|salt|bay|gulf|caldera|peninsula|delta|ice ?shelf|ice ?field|basin)\b/i;

/** How far in to look: sites get a few km, epicentres and lakes a region. */
export function satelliteZoom(pin: Pick<Pin, "category" | "title" | "live">): number {
  const title = pin.title;
  if (pin.live) return pin.category === "earthquake" ? 10 : 11;
  switch (pin.category) {
    case "earthquake":
      return 10;
    case "shipwreck":
      return 9; // mostly open water: at least show the coast
    case "natural disaster":
      return 11;
    case "battle":
      return 13;
    case "volcano":
      return 12;
    case "impact":
      return 13;
    case "fossil":
      return 13;
    case "geography":
      return CLOSE_UP.test(title) ? 15 : WIDE.test(title) ? 11 : 12;
    default:
      return CLOSE_UP.test(title) ? 16 : 15;
  }
}

/** The smallest standard Wikimedia width that is at least `width` (capped at the largest). */
export function thumbStep(width: number): number {
  for (const step of THUMB_STEPS) if (step >= width) return step;
  return THUMB_STEPS[THUMB_STEPS.length - 1];
}

const THUMB_WIDTH = /\/((?:lossy-|lossless-)?(?:page\d+-)?)(\d{2,4})px-/;

/**
 * Resize a stored image URL (Wikimedia thumbs, Commons FilePath) to at least
 * `width` px, snapped to a width Wikimedia will actually serve.
 */
export function sizedImage(url: string, width: number): string {
  const step = thumbStep(width);
  if (/upload\.wikimedia\.org\/.*\/thumb\//.test(url)) {
    return url.replace(THUMB_WIDTH, `/$1${step}px-`);
  }
  return url.replace(/([?&])width=\d+/, `$1width=${step}`);
}

/**
 * The URLs worth trying for a stored photo, best first: the card-sized
 * thumbnail, then the stored URL itself when Wikimedia will serve it as-is
 * (an original, or a thumbnail already at a standard width — useful when the
 * original is narrower than the card size), then the next step down for a
 * stored non-standard width (older caches hold 640 px URLs).
 */
export function photoCandidates(url: string, width: number): string[] {
  const out = [sizedImage(url, width)];
  const stored = THUMB_WIDTH.exec(url);
  if (!/upload\.wikimedia\.org\/.*\/thumb\//.test(url) || !stored) {
    out.push(url);
  } else {
    const w = Number(stored[2]);
    if ((THUMB_STEPS as readonly number[]).includes(w)) out.push(url);
    else {
      const below = [...THUMB_STEPS].reverse().find((s) => s < w);
      if (below) out.push(url.replace(THUMB_WIDTH, `/$1${below}px-`));
    }
  }
  return [...new Set(out)];
}

/** A Wikipedia article reference parsed from a story URL. */
export interface WikiRef {
  lang: string;
  title: string;
}

/** `https://en.wikipedia.org/wiki/Battle_of_Kursk` → { lang: "en", title: "Battle of Kursk" }. */
export function wikipediaRef(url: string | null | undefined): WikiRef | null {
  if (!url) return null;
  const m = /^https?:\/\/([a-z0-9-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i.exec(url);
  if (!m) return null;
  let title = m[2]!;
  try {
    title = decodeURIComponent(title);
  } catch {
    // keep the raw title
  }
  title = title.replace(/_/g, " ").trim();
  if (!title || /^(special|file|category|portal|help|wikipedia|template|talk):/i.test(title)) return null;
  return { lang: m[1]!.toLowerCase(), title };
}

export function photoCredit(url: string): string {
  if (/upload\.wikimedia\.org\/wikipedia\/(?!commons\/)[a-z-]+\//.test(url)) return "Wikipedia";
  if (/wikimedia\.org|wikipedia\.org/.test(url)) return "Wikimedia Commons";
  if (/volcano\.si\.edu/.test(url)) return "Smithsonian GVP";
  if (/nasa\.gov/.test(url)) return "NASA";
  return "";
}

export interface ImageOptions {
  width?: number;
  height?: number;
  /** Skip the photo even if one exists (used after a photo fails to load). */
  forceSatellite?: boolean;
}

/**
 * The first-choice picture for a pin, synchronously: the cached photo when
 * there is one, a satellite view otherwise. Never null. The card goes
 * further (live Wikipedia lookup) through PinImageResolver.
 */
export function imageFor(pin: Pin, opts: ImageOptions = {}): PinImage {
  const width = opts.width ?? CARD_WIDTH;
  if (!opts.forceSatellite && pin.imageUrl && isPhotoUrl(pin.imageUrl)) {
    return { url: sizedImage(pin.imageUrl, width), kind: "photo", credit: photoCredit(pin.imageUrl) };
  }
  return satelliteImage(pin, opts);
}

/** The backup: a satellite view of the spot, sized like a card image by default. */
export function satelliteImage(pin: Pick<Pin, "lat" | "lng" | "category" | "title" | "live">, opts: ImageOptions = {}): PinImage {
  const width = opts.width ?? 640;
  const height = opts.height ?? 360;
  return {
    url: satelliteUrl(pin.lat, pin.lng, satelliteZoom(pin), width, height),
    kind: "satellite",
    credit: GOOGLE_MAPS_KEY ? GOOGLE_CREDIT : SATELLITE_CREDIT,
  };
}
