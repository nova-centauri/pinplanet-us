import * as THREE from "three";
import { latLngToVector3 } from "./geo";

/**
 * Sub-solar point for "now": declination from the day of year, longitude
 * from UTC time (equation of time ignored — a few minutes of error is
 * invisible on a point-cloud globe). Lets the globe show real day/night.
 */
export function sunDirection(date = new Date(), target = new THREE.Vector3()): THREE.Vector3 {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86_400_000;
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365.25) * (day - 81));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const lng = -15 * (hours - 12);
  return latLngToVector3(decl, lng, 1, target).normalize();
}
