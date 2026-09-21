import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { latLngToVector3 } from "./geo";
import { globeRadius } from "./theme";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

/**
 * Rasterize Natural Earth land (110m) and keep Fibonacci-sphere samples
 * that fall on land. Gives a recognizable dotted Earth without a texture.
 */
export function buildLandPositions(count = 16000): Float32Array {
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
  if (!ctx) return new Float32Array(0);

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
  const isLand = (lat: number, lng: number): boolean => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(((lng + 180) / 360) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
    return pixels[(y * width + x) * 4]! > 128;
  };

  const golden = Math.PI * (3 - Math.sqrt(5));
  const probe = Math.floor(count * 2.6);
  const positions: number[] = [];

  for (let i = 0; i < probe && positions.length / 3 < count; i++) {
    const y = 1 - (i / Math.max(probe - 1, 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const lat = (Math.asin(THREE_CLAMP(y)) * 180) / Math.PI;
    const lng = (Math.atan2(z, x) * 180) / Math.PI;
    if (!isLand(lat, lng)) continue;
    const v = latLngToVector3(lat, lng, globeRadius);
    positions.push(v.x, v.y, v.z);
  }

  return new Float32Array(positions);
}

function THREE_CLAMP(n: number): number {
  return Math.min(1, Math.max(-1, n));
}
