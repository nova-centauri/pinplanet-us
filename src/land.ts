import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { latLngToVector3 } from "./geo";
import { globeRadius } from "./theme";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

export interface LandCloud {
  positions: Float32Array;
  /** 0 = interior, 1 = coast, 2 = ice (Antarctica / Greenland interior) */
  kind: Float32Array;
  /** coast strength 0..1 — how much ocean surrounds the sample */
  coast: Float32Array;
  sizes: Float32Array;
}

/**
 * Rasterize Natural Earth land and sample a Fibonacci cloud. Colour is
 * decided in the shader from the theme, so only classification lives here.
 */
export function buildLandCloud(count = 24000): LandCloud {
  const raw = feature(
    landTopo as never,
    (landTopo as { objects: { land: never } }).objects.land,
  ) as unknown as {
    geometry?: { type: string; coordinates: MultiPolygon | Polygon };
    features?: { geometry: { type: string; coordinates: MultiPolygon | Polygon } }[];
  };
  const geometry = raw.geometry ?? raw.features?.[0]?.geometry;
  if (!geometry) {
    throw new Error("world-atlas land geometry missing");
  }

  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { positions: new Float32Array(0), kind: new Float32Array(0), coast: new Float32Array(0), sizes: new Float32Array(0) };
  }

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff";

  const polygons: MultiPolygon =
    geometry.type === "Polygon"
      ? [geometry.coordinates as Polygon]
      : (geometry.coordinates as MultiPolygon);

  for (const polygon of polygons) {
    ctx.beginPath();
    for (const ring of polygon) {
      // Unwrap rings that cross the antimeridian (Fiji, Chukotka…): a raw
      // lineTo from 179.9° to −179.9° would sweep a sliver across the whole
      // map. Draw the unwrapped ring at three offsets; the canvas clips.
      const unwrapped = unwrapRing(ring);
      const crosses = unwrapped.some(([lng]) => lng > 180 || lng < -180);
      for (const offset of crosses ? [-360, 0, 360] : [0]) {
        unwrapped.forEach(([lng, lat], i) => {
          const x = ((lng + offset + 180) / 360) * width;
          const y = ((90 - lat) / 180) * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    }
    ctx.fill("evenodd");
  }

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const landAt = (x: number, y: number): boolean => {
    const xx = Math.min(width - 1, Math.max(0, x));
    const yy = Math.min(height - 1, Math.max(0, y));
    return pixels[(yy * width + xx) * 4]! > 128;
  };

  const NEIGHBOURS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ] as const;
  const coastAt = (x: number, y: number): number => {
    let ocean = 0;
    for (const [dx, dy] of NEIGHBOURS) if (!landAt(x + dx, y + dy)) ocean += 1;
    return ocean / NEIGHBOURS.length;
  };

  const golden = Math.PI * (3 - Math.sqrt(5));
  const probe = Math.floor(count * 2.8);
  const positions: number[] = [];
  const kind: number[] = [];
  const coast: number[] = [];
  const sizes: number[] = [];

  for (let i = 0; i < probe && positions.length / 3 < count; i++) {
    const y = 1 - (i / Math.max(probe - 1, 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const lat = (Math.asin(clamp(y)) * 180) / Math.PI;
    const lng = (Math.atan2(z, x) * 180) / Math.PI;
    const px = Math.floor(((lng + 180) / 360) * width);
    const py = Math.floor(((90 - lat) / 180) * height);
    if (!landAt(px, py)) continue;

    const c = coastAt(px, py);
    const v = latLngToVector3(lat, lng, globeRadius);
    positions.push(v.x, v.y, v.z);

    if (c > 0.2) {
      const k = Math.min(1, c * 1.4);
      kind.push(1);
      coast.push(k);
      sizes.push(1.12 + k * 0.28);
    } else if (lat < -62 || (lat > 72 && lng > -60 && lng < -20)) {
      kind.push(2);
      coast.push(0);
      sizes.push(0.92);
    } else {
      kind.push(0);
      coast.push(0);
      sizes.push(0.9 + Math.random() * 0.1);
    }
  }

  return {
    positions: new Float32Array(positions),
    kind: new Float32Array(kind),
    coast: new Float32Array(coast),
    sizes: new Float32Array(sizes),
  };
}

function clamp(n: number): number {
  return Math.min(1, Math.max(-1, n));
}

/** Shift longitudes so no consecutive pair jumps more than 180°. */
function unwrapRing(ring: Ring): Ring {
  const out: Ring = [];
  let shift = 0;
  let prev: number | null = null;
  for (const [lng, lat] of ring) {
    if (prev !== null) {
      const d = lng + shift - prev;
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    const x = lng + shift;
    out.push([x, lat]);
    prev = x;
  }
  return out;
}
