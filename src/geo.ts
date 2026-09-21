import * as THREE from "three";
import { globeRadius } from "./theme";

const DEG = Math.PI / 180;

/** Convert geographic lat/lng to a Y-up Three.js position on the globe. */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius = globeRadius,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return target.set(x, y, z);
}

/** Shortest-arc sample between two unit directions. */
export function slerpDir(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion().setFromUnitVectors(a, b);
  const q = qa.slerp(qb, t);
  return target.copy(a).applyQuaternion(q).normalize();
}

/** Slow push, fast cruise, soft settle — reads as a camera move, not a lerp. */
export function easeCinematic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
