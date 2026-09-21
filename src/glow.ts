import * as THREE from "three";

let cached: THREE.Texture | null = null;

/** Soft additive disc — used for pin blooms and the flight spark. */
export function glowTexture(): THREE.Texture {
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cached = new THREE.Texture();
    return cached;
  }
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(196,230,255,0.85)");
  g.addColorStop(0.42, "rgba(125,207,255,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  return cached;
}
