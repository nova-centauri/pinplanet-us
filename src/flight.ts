import * as THREE from "three";
import { easeCinematic, latLngToVector3, slerpDir } from "./geo";
import { glowTexture } from "./glow";
import { dwellDistance, flightDuration, flightLift, globeRadius } from "./theme";
import type { Theme } from "./themes";
import type { Pin } from "./types";

export type FlightPhase = "idle" | "flying";

const BASE_FOV = 40;

function offsetView(dir: THREE.Vector3, yaw = 0.34): THREE.Vector3 {
  const axis = new THREE.Vector3(0, 1, 0).cross(dir);
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  axis.normalize();
  return dir
    .clone()
    .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, yaw))
    .normalize();
}

class RaisedArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly fromDir: THREE.Vector3,
    private readonly toDir: THREE.Vector3,
    private readonly radius: number,
    private readonly lift: number,
  ) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const r = this.radius + this.lift * Math.pow(Math.sin(Math.PI * t), 0.72);
    return slerpDir(this.fromDir, this.toDir, t, target).multiplyScalar(r);
  }
}

const trailVert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const trailFrag = `
uniform float uProgress;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  if (vUv.x > uProgress) discard;
  float head = smoothstep(uProgress - 0.16, uProgress, vUv.x);
  float born = smoothstep(0.0, 0.08, vUv.x);
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float a = uOpacity * (0.18 + 0.82 * head) * born * (0.35 + 0.65 * across);
  gl_FragColor = vec4(uColor, a);
}
`;

export class FlightRig {
  phase: FlightPhase = "idle";
  progress = 0;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly earth: THREE.Group;
  private readonly look = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly spark: THREE.Sprite;
  private readonly scratch = new THREE.Vector3();
  private trailCore: THREE.Mesh | null = null;
  private trailGlow: THREE.Mesh | null = null;
  private fadeCore: THREE.Mesh | null = null;
  private fadeGlow: THREE.Mesh | null = null;
  private trailCurve: RaisedArcCurve | null = null;
  private colorCore = 0x7dcfff;
  private colorGlow = 0x7aa2f7;
  private additive = true;

  private fromDir = new THREE.Vector3(0, 0, 1);
  private toDir = new THREE.Vector3(0, 0, 1);
  private fromRadius = 6.4;
  private toRadius = dwellDistance;
  private elapsed = 0;
  private duration = flightDuration;
  private lookFrom = new THREE.Vector3();
  private lookTo = new THREE.Vector3();
  private bankSign = 1;
  private idleTime = 0;

  constructor(camera: THREE.PerspectiveCamera, earth: THREE.Group) {
    this.camera = camera;
    this.earth = earth;

    this.spark = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: this.colorCore,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.spark.scale.setScalar(0.18);
    this.spark.visible = false;
    this.earth.add(this.spark);
  }

  applyTheme(theme: Theme): void {
    this.colorCore = theme.globe.trailCore;
    this.colorGlow = theme.globe.trailGlow;
    this.additive = theme.globe.additive;
    const sparkMat = this.spark.material as THREE.SpriteMaterial;
    sparkMat.color.setHex(this.colorCore);
    sparkMat.blending = this.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    sparkMat.needsUpdate = true;
    for (const [mesh, color] of [
      [this.trailCore, this.colorCore],
      [this.fadeCore, this.colorCore],
      [this.trailGlow, this.colorGlow],
      [this.fadeGlow, this.colorGlow],
    ] as const) {
      if (!mesh) continue;
      const mat = mesh.material as THREE.ShaderMaterial;
      (mat.uniforms.uColor!.value as THREE.Color).setHex(color);
      mat.blending = this.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      mat.needsUpdate = true;
    }
  }

  /** Where the camera currently looks from, as a unit direction. */
  viewDir(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.camera.position).normalize();
  }

  start(from: Pin | null, to: Pin, duration = flightDuration): void {
    const pinDir = latLngToVector3(to.lat, to.lng, 1);
    const fromDir = this.camera.position.clone().normalize();
    const trailFrom = from ? latLngToVector3(from.lat, from.lng, 1) : fromDir;
    const crossing = new THREE.Vector3().crossVectors(fromDir, pinDir);

    this.fromDir.copy(fromDir);
    this.toDir.copy(offsetView(pinDir, 0.3));
    this.fromRadius = this.camera.position.length();
    this.toRadius = dwellDistance;
    this.lookFrom.copy(this.look);
    this.lookTo.set(0, 0, 0);
    this.bankSign = Math.sign(crossing.y) || 1;
    this.elapsed = 0;
    this.duration = duration;
    this.phase = "flying";
    this.progress = 0;
    this.idleTime = 0;

    this.retireTrail();
    this.trailCurve = new RaisedArcCurve(trailFrom, pinDir, globeRadius * 1.02, 0.58);
    const { core, glow } = this.makeTrail(this.trailCurve);
    this.trailCore = core;
    this.trailGlow = glow;
    this.earth.add(core, glow);
    this.spark.visible = true;
  }

  /** Advance the flight. Returns true on the frame the camera lands. */
  update(dt: number): boolean {
    if (this.phase !== "flying") {
      this.idleTime += dt;
      this.fadeOldTrails(dt);
      return false;
    }

    this.elapsed += dt;
    const raw = Math.min(1, this.elapsed / this.duration);
    const t = easeCinematic(raw);
    this.progress = t;

    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion().setFromUnitVectors(this.fromDir, this.toDir);
    const qT = new THREE.Quaternion().slerp(q, t);
    dir.copy(this.fromDir).applyQuaternion(qT).normalize();

    const lift = Math.pow(Math.sin(Math.PI * t), 0.68) * flightLift;
    const radius = THREE.MathUtils.lerp(this.fromRadius, this.toRadius, t) + lift;

    const ahead = this.trailCurve
      ? this.trailCurve.getPoint(Math.min(1, t + 0.08), this.scratch)
      : this.origin;
    const lookMix = Math.sin(Math.PI * t) * 0.42;
    this.look.lerpVectors(this.lookFrom, this.lookTo, t);
    this.look.lerp(ahead, lookMix);

    const roll = Math.sin(Math.PI * t) * 0.28 * this.bankSign;
    this.applyPose(dir, radius, this.look, roll);
    this.camera.fov = BASE_FOV + Math.sin(Math.PI * t) * 8.5;
    this.camera.updateProjectionMatrix();
    this.drawTrail(t);

    if (this.elapsed >= this.duration) {
      this.phase = "idle";
      this.progress = 1;
      this.spark.visible = false;
      (this.spark.material as THREE.SpriteMaterial).opacity = 0;
      this.camera.fov = BASE_FOV;
      this.camera.updateProjectionMatrix();
      this.applyPose(this.toDir, this.toRadius, this.origin, 0);
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
    this.applyPose(this.toDir, this.breatheRadius(), this.origin, 0);
  }

  spin(radians: number): void {
    if (this.phase !== "idle") return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.toDir.applyQuaternion(q).normalize();
    this.fromDir.copy(this.toDir);
    this.applyPose(this.toDir, this.breatheRadius(), this.origin, 0);
  }

  private breatheRadius(): number {
    return this.toRadius + Math.sin(this.idleTime * 0.42) * 0.045;
  }

  private applyPose(dir: THREE.Vector3, radius: number, look: THREE.Vector3, roll: number): void {
    this.look.copy(look);
    this.camera.position.copy(dir).multiplyScalar(radius);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    if (Math.abs(roll) > 1e-4) {
      const view = look.clone().sub(this.camera.position).normalize();
      this.camera.up.applyAxisAngle(view, roll);
      this.camera.lookAt(look);
    }
  }

  private makeTrail(curve: RaisedArcCurve): { core: THREE.Mesh; glow: THREE.Mesh } {
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, 0.009, 8, false), this.trailMaterial(this.colorCore, 0.95));
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, 0.028, 10, false), this.trailMaterial(this.colorGlow, 0.38));
    core.renderOrder = 3;
    glow.renderOrder = 2;
    return { core, glow };
  }

  private trailMaterial(color: number, opacity: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      vertexShader: trailVert,
      fragmentShader: trailFrag,
    });
  }

  private drawTrail(t: number): void {
    const mats = [this.trailCore, this.trailGlow].map((mesh) => mesh?.material as THREE.ShaderMaterial | undefined);
    for (const mat of mats) {
      if (mat) mat.uniforms.uProgress!.value = t;
    }
    if (this.trailCurve) {
      this.spark.position.copy(this.trailCurve.getPoint(t));
      const head = 0.35 + 0.65 * Math.sin(Math.PI * t);
      (this.spark.material as THREE.SpriteMaterial).opacity = head;
      this.spark.scale.setScalar(0.14 + 0.16 * Math.sin(Math.PI * t));
    }
  }

  private retireTrail(): void {
    this.disposePair(this.fadeCore, this.fadeGlow);
    this.fadeCore = this.trailCore;
    this.fadeGlow = this.trailGlow;
    this.trailCore = null;
    this.trailGlow = null;
    this.dim(this.fadeCore, 0.2);
    this.dim(this.fadeGlow, 0.1);
  }

  private fadeOldTrails(dt: number): void {
    const fade = (mesh: THREE.Mesh | null): THREE.Mesh | null => {
      if (!mesh) return null;
      const mat = mesh.material as THREE.ShaderMaterial;
      const next = Math.max(0, (mat.uniforms.uOpacity!.value as number) - dt * 0.12);
      mat.uniforms.uOpacity!.value = next;
      if (next <= 0) {
        this.earth.remove(mesh);
        mesh.geometry.dispose();
        mat.dispose();
        return null;
      }
      return mesh;
    };
    this.fadeCore = fade(this.fadeCore);
    this.fadeGlow = fade(this.fadeGlow);
  }

  private dim(mesh: THREE.Mesh | null, opacity: number): void {
    if (!mesh) return;
    (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity!.value = opacity;
  }

  private disposePair(a: THREE.Mesh | null, b: THREE.Mesh | null): void {
    for (const mesh of [a, b]) {
      if (!mesh) continue;
      this.earth.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
