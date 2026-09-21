import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { latLngToVector3 } from "./geo";
import { globeRadius } from "./theme";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

export interface LandCloud {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
}

/**
 * Rasterize Natural Earth land and sample a Fibonacci cloud.
 * Coast pixels get cyan and a little extra size so continents have an edge.
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
    return {
      positions: new Float32Array(0),
      colors: new Float32Array(0),
      sizes: new Float32Array(0),
    };
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
      ring.forEach(([lng, lat], i) => {
        const x = ((lng + 180) / 360) * width;
        const y = ((90 - lat) / 180) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const landAt = (x: number, y: number): boolean => {
    const xx = Math.min(width - 1, Math.max(0, x));
    const yy = Math.min(height - 1, Math.max(0, y));
    return pixels[(yy * width + xx) * 4]! > 128;
  };

  const coastAt = (x: number, y: number): number => {
    let ocean = 0;
    const n = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ];
    for (const [dx, dy] of n) {
      if (!landAt(x + dx, y + dy)) ocean += 1;
    }
    return ocean / n.length;
  };

  const golden = Math.PI * (3 - Math.sqrt(5));
  const probe = Math.floor(count * 2.8);
  const positions: number[] = [];
  const colors: number[] = [];
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

    const coast = coastAt(px, py);
    const v = latLngToVector3(lat, lng, globeRadius);
    positions.push(v.x, v.y, v.z);

    if (coast > 0.2) {
      const k = Math.min(1, coast * 1.4);
      colors.push(0.52 + 0.2 * k, 0.68 + 0.18 * k, 0.98);
      sizes.push(1.05 + k * 0.35);
    } else if (lat < -62) {
      colors.push(0.78, 0.82, 0.94);
      sizes.push(0.88);
    } else {
      colors.push(0.68, 0.73, 0.9);
      sizes.push(0.82 + Math.random() * 0.12);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    sizes: new Float32Array(sizes),
  };
}

function clamp(n: number): number {
  return Math.min(1, Math.max(-1, n));
}
