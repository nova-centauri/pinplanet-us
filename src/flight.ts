import * as THREE from "three";
import { easeInOutQuart, greatCircle, latLngToVector3 } from "./geo";
import { dwellDistance, flightDuration, flightLift, globeRadius, theme } from "./theme";
import type { Pin } from "./types";

export type FlightPhase = "idle" | "flying";

export class FlightRig {
  phase: FlightPhase = "idle";
  progress = 0;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly earth: THREE.Group;
  private readonly look = new THREE.Vector3();
  private readonly spark: THREE.Mesh;
  private trail: THREE.Mesh | null = null;
  private fadeTrail: THREE.Mesh | null = null;

  private fromDir = new THREE.Vector3(0, 0, 1);
  private toDir = new THREE.Vector3(0, 0, 1);
  private fromRadius = 5.2;
  private toRadius = dwellDistance;
  private elapsed = 0;
  private duration = flightDuration;
  private lookFrom = new THREE.Vector3();
  private lookTo = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, earth: THREE.Group) {
    this.camera = camera;
    this.earth = earth;

    this.spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 12),
      new THREE.MeshBasicMaterial({ color: theme.cyan }),
    );
    this.spark.visible = false;
    this.earth.add(this.spark);
  }

  placeIdle(pin: Pin, radius = dwellDistance): void {
    const dir = latLngToVector3(pin.lat, pin.lng, 1);
    this.fromDir.copy(dir);
    this.toDir.copy(dir);
    this.fromRadius = radius;
    this.toRadius = radius;
    this.lookFrom.copy(dir).multiplyScalar(globeRadius * 0.2);
    this.lookTo.copy(this.lookFrom);
    this.applyPose(dir, radius, this.lookFrom);
    this.phase = "idle";
    this.progress = 1;
  }

  start(from: Pin | null, to: Pin, duration = flightDuration): void {
    const toDir = latLngToVector3(to.lat, to.lng, 1);
    const fromDir = this.camera.position.clone().normalize();
    const trailFrom = from
      ? latLngToVector3(from.lat, from.lng, 1)
      : fromDir;

    this.fromDir.copy(fromDir);
    this.toDir.copy(toDir);
    this.fromRadius = this.camera.position.length();
    this.toRadius = dwellDistance;
    this.lookFrom.copy(this.look);
    this.lookTo.copy(toDir).multiplyScalar(globeRadius * 0.22);
    this.elapsed = 0;
    this.duration = duration;
    this.phase = "flying";
    this.progress = 0;

    this.retireTrail();
    this.trail = this.makeTrail(trailFrom, toDir);
    this.earth.add(this.trail);
    this.spark.visible = true;
  }

  /** Advance the flight. Returns true on the frame the camera lands. */
  update(dt: number): boolean {
    if (this.phase !== "flying") {
      this.fadeOldTrails(dt);
      return false;
    }

    this.elapsed += dt;
    const t = easeInOutQuart(Math.min(1, this.elapsed / this.duration));
    this.progress = t;

    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion().setFromUnitVectors(this.fromDir, this.toDir);
    const qT = new THREE.Quaternion().slerp(q, t);
    dir.copy(this.fromDir).applyQuaternion(qT).normalize();

    const radius =
      THREE.MathUtils.lerp(this.fromRadius, this.toRadius, t) +
      Math.sin(t * Math.PI) * flightLift;
    this.look.lerpVectors(this.lookFrom, this.lookTo, t);
    this.applyPose(dir, radius, this.look);
    this.drawTrail(t);

    if (this.elapsed >= this.duration) {
      this.phase = "idle";
      this.progress = 1;
      this.spark.visible = false;
      return true;
    }
    return false;
  }

  orbit(dLng: number, dLat: number): void {
    if (this.phase !== "idle") return;
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dLng);
    const right = new THREE.Vector3().crossVectors(this.camera.up, this.toDir).normalize();
    if (!Number.isFinite(right.x)) right.set(1, 0, 0);
    const qX = new THREE.Quaternion().setFromAxisAngle(right, dLat);
    this.toDir.applyQuaternion(qY).applyQuaternion(qX).normalize();
    this.fromDir.copy(this.toDir);
    this.applyPose(this.toDir, this.toRadius, this.lookTo);
  }

  spin(radians: number): void {
    if (this.phase !== "idle") return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.toDir.applyQuaternion(q).normalize();
    this.fromDir.copy(this.toDir);
    this.applyPose(this.toDir, this.toRadius, this.lookTo);
  }

  private applyPose(dir: THREE.Vector3, radius: number, look: THREE.Vector3): void {
    this.look.copy(look);
    this.camera.position.copy(dir).multiplyScalar(radius);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
  }

  private makeTrail(fromDir: THREE.Vector3, toDir: THREE.Vector3): THREE.Mesh {
    const points = greatCircle(
      fromDir.clone().multiplyScalar(globeRadius),
      toDir.clone().multiplyScalar(globeRadius),
    );
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 96, 0.011, 8, false);
    const material = new THREE.MeshBasicMaterial({
      color: theme.cyan,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    geometry.setDrawRange(0, 0);
    return mesh;
  }

  private drawTrail(t: number): void {
    if (!this.trail) return;
    const index = this.trail.geometry.getIndex();
    const total = index ? index.count : this.trail.geometry.attributes.position.count;
    this.trail.geometry.setDrawRange(0, Math.max(3, Math.floor(t * total)));
    const mat = this.trail.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.35 + 0.55 * Math.sin(t * Math.PI);

    const points = greatCircle(
      this.fromDir.clone().multiplyScalar(globeRadius),
      this.toDir.clone().multiplyScalar(globeRadius),
    );
    const idx = Math.min(points.length - 1, Math.floor(t * (points.length - 1)));
    this.spark.position.copy(points[idx]!);
  }

  private retireTrail(): void {
    if (this.fadeTrail) {
      this.earth.remove(this.fadeTrail);
      this.fadeTrail.geometry.dispose();
      (this.fadeTrail.material as THREE.Material).dispose();
    }
    this.fadeTrail = this.trail;
    this.trail = null;
    if (this.fadeTrail) {
      (this.fadeTrail.material as THREE.MeshBasicMaterial).opacity = 0.22;
    }
  }

  private fadeOldTrails(dt: number): void {
    if (!this.fadeTrail) return;
    const mat = this.fadeTrail.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, mat.opacity - dt * 0.18);
    if (mat.opacity <= 0) {
      this.earth.remove(this.fadeTrail);
      this.fadeTrail.geometry.dispose();
      mat.dispose();
      this.fadeTrail = null;
    }
  }
}
