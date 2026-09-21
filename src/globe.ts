import * as THREE from "three";
import { hash01, latLngToVector3 } from "./geo";
import { glowTexture } from "./glow";
import { buildLandCloud } from "./land";
import { sunDirection } from "./sun";
import { globeRadius } from "./theme";
import type { Theme } from "./themes";
import type { Pin } from "./types";

/**
 * The globe: land point-cloud, body, atmosphere, stars, and every pin as a
 * single Points draw call (2,000+ pins at 60 fps). The active pin gets one
 * detailed marker (halo, rings, beam, bloom) that moves to whichever pin is
 * current. All colours are theme uniforms so switching is instant.
 */

const FAMILY_INDEX = { nature: 0, human: 1, live: 2 } as const;
const PIN_RADIUS = globeRadius * 1.004;

const landVert = `
attribute float aSize;
attribute float aKind;
attribute float aCoast;
uniform float uPixelRatio;
uniform float uScale;
uniform vec3 uLand;
uniform vec3 uCoast;
uniform vec3 uIce;
varying vec3 vColor;
varying float vFacing;
varying vec3 vN;
void main() {
  vColor = aKind > 1.5 ? uIce : (aKind > 0.5 ? mix(uLand, uCoast, aCoast) : uLand);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(world.xyz);
  vN = n;
  vec3 viewDir = normalize(cameraPosition - world.xyz);
  vFacing = max(dot(n, viewDir), 0.0);
  vec4 mv = viewMatrix * world;
  float dist = max(-mv.z, 1.4);
  gl_PointSize = max(1.25, aSize * uScale * uPixelRatio * (9.8 / dist));
  gl_Position = projectionMatrix * mv;
}
`;

const landFrag = `
uniform vec3 uSun;
uniform float uSunMix;
varying vec3 vColor;
varying float vFacing;
varying vec3 vN;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 0.62) discard;
  float core = 1.0 - smoothstep(0.08, 0.62, d);
  float depth = 0.34 + 0.66 * pow(vFacing, 0.7);
  float day = smoothstep(-0.22, 0.32, dot(vN, uSun));
  float light = mix(1.0, 0.42 + 0.58 * day, uSunMix);
  gl_FragColor = vec4(vColor, core * depth * light);
}
`;

const pinVert = `
attribute float aSize;
attribute float aFamily;
attribute float aPhase;
attribute float aLive;
uniform float uPixelRatio;
uniform float uTime;
uniform vec3 uColors[3];
varying vec3 vColor;
varying float vFacing;
varying float vLive;
varying float vTw;
void main() {
  int f = int(aFamily + 0.5);
  vColor = f == 0 ? uColors[0] : (f == 1 ? uColors[1] : uColors[2]);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(world.xyz);
  vec3 viewDir = normalize(cameraPosition - world.xyz);
  vFacing = max(dot(n, viewDir), 0.0);
  vec4 mv = viewMatrix * world;
  float dist = max(-mv.z, 1.4);
  float tw = 0.86 + 0.14 * sin(uTime * 1.6 + aPhase * 6.2831);
  float pulse = aLive > 0.5 ? (1.0 + 0.5 * (0.5 + 0.5 * sin(uTime * 3.2 + aPhase * 6.2831))) : 1.0;
  vTw = tw;
  vLive = aLive;
  gl_PointSize = max(2.0, aSize * uPixelRatio * pulse * tw * (12.0 / dist));
  gl_Position = projectionMatrix * mv;
}
`;

const pinFrag = `
uniform float uAlpha;
varying vec3 vColor;
varying float vFacing;
varying float vLive;
varying float vTw;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.4);
  float core = 1.0 - smoothstep(0.0, 0.14, d);
  float depth = 0.2 + 0.8 * pow(vFacing, 0.9);
  vec3 c = mix(vColor, vec3(1.0), core * 0.55);
  float a = (glow * 0.6 + core) * depth * vTw * uAlpha;
  if (vLive > 0.5) a *= 1.25;
  gl_FragColor = vec4(c, min(a, 1.0));
}
`;

const rimVert = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const bodyFrag = `
uniform vec3 uDeep;
uniform vec3 uEdge;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
  float rim = pow(1.0 - facing, 2.6);
  gl_FragColor = vec4(mix(uDeep, uEdge, rim * 0.85), 1.0);
}
`;

const atmoFrag = `
varying vec3 vNormal;
varying vec3 vView;
uniform vec3 uColor;
uniform float uPower;
uniform float uStrength;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
  gl_FragColor = vec4(uColor, f * uStrength);
}
`;

interface ActiveMarker {
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  pulse: THREE.Mesh;
  pulse2: THREE.Mesh;
  glow: THREE.Sprite;
  beam: THREE.Mesh;
}

export class GlobeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly earth: THREE.Group;

  private readonly clock = new THREE.Clock();
  readonly landMat: THREE.ShaderMaterial;
  private readonly bodyMat: THREE.ShaderMaterial;
  private readonly meridianMat: THREE.LineBasicMaterial;
  private readonly atmoInner: THREE.ShaderMaterial;
  private readonly atmoOuter: THREE.ShaderMaterial;
  private readonly starMat: THREE.PointsMaterial;
  private readonly starMatBig: THREE.PointsMaterial;
  private readonly stars: THREE.Points;
  private readonly starsBig: THREE.Points;
  private readonly pinMat: THREE.ShaderMaterial;
  private pinPoints: THREE.Points | null = null;
  private pinList: Pin[] = [];
  private readonly pinIndex = new Map<string, number>();
  private readonly marker: ActiveMarker;
  private activeId: string | null = null;
  private activePhase = 0;
  private theme: Theme | null = null;
  private starBaseAlpha = 0.6;
  private readonly sun = new THREE.Vector3(1, 0, 0);
  private readonly raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x0d0f17, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0d0f17, 0.022);

    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.08, 120);
    this.camera.position.set(0, 0.55, 6.4);

    this.earth = new THREE.Group();
    this.scene.add(this.earth);

    this.landMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uScale: { value: 1 },
        uLand: { value: new THREE.Color(0xbcc9f5) },
        uCoast: { value: new THREE.Color(0xa6d3ff) },
        uIce: { value: new THREE.Color(0xd1dbf5) },
        uSun: { value: this.sun },
        uSunMix: { value: 0.55 },
      },
      vertexShader: landVert,
      fragmentShader: landFrag,
    });

    this.bodyMat = new THREE.ShaderMaterial({
      vertexShader: rimVert,
      fragmentShader: bodyFrag,
      uniforms: {
        uDeep: { value: new THREE.Color(0x07080d) },
        uEdge: { value: new THREE.Color(0x2e3d6b) },
      },
    });
    this.meridianMat = new THREE.LineBasicMaterial({ color: 0x565f89, transparent: true, opacity: 0.07 });
    this.atmoInner = this.atmoMaterial(THREE.FrontSide, 3.2, 0.28);
    this.atmoOuter = this.atmoMaterial(THREE.BackSide, 2.05, 0.46);

    const glow = glowTexture();
    this.starMat = new THREE.PointsMaterial({ color: 0xc0caf5, size: 0.05, map: glow, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending });
    this.starMatBig = new THREE.PointsMaterial({ color: 0xc0caf5, size: 0.16, map: glow, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending });
    this.stars = this.makeStars(2600, 16, 36, this.starMat);
    this.starsBig = this.makeStars(220, 14, 30, this.starMatBig);
    this.scene.add(this.stars, this.starsBig);

    this.pinMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uColors: { value: [new THREE.Color(0x7dcfff), new THREE.Color(0xbb9af7), new THREE.Color(0xff9e64)] },
      },
      vertexShader: pinVert,
      fragmentShader: pinFrag,
    });

    this.addGlobeBody();
    try {
      this.addLand();
    } catch (error) {
      console.warn("Land point-cloud failed; using sparse sphere", error);
      this.addFallbackDots();
    }
    this.addAtmosphere();
    this.marker = this.makeMarker();
    this.earth.add(this.marker.group);
    this.marker.group.visible = false;

    window.addEventListener("resize", () => this.resize());
  }

  /** Replace the pin cloud. Cheap: called whenever the pool changes. */
  setPins(pins: Pin[]): void {
    this.pinList = pins;
    this.pinIndex.clear();
    const n = pins.length;
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const families = new Float32Array(n);
    const phases = new Float32Array(n);
    const lives = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const pin = pins[i]!;
      latLngToVector3(pin.lat, pin.lng, PIN_RADIUS, v);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      sizes[i] = pin.live ? 1.35 : 0.62 + pin.rank * 0.5;
      families[i] = FAMILY_INDEX[pin.family];
      phases[i] = hash01(pin.id);
      lives[i] = pin.live ? 1 : 0;
      this.pinIndex.set(pin.id, i);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aFamily", new THREE.BufferAttribute(families, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aLive", new THREE.BufferAttribute(lives, 1));
    if (this.pinPoints) {
      this.earth.remove(this.pinPoints);
      this.pinPoints.geometry.dispose();
    }
    this.pinPoints = new THREE.Points(geometry, this.pinMat);
    this.pinPoints.renderOrder = 2;
    this.pinPoints.frustumCulled = false;
    this.earth.add(this.pinPoints);
    if (this.activeId) this.setActive(this.activeId, pins.find((p) => p.id === this.activeId) ?? null);
  }

  /** Move a single pin (the ISS) without rebuilding the cloud. */
  movePin(id: string, lat: number, lng: number): void {
    const i = this.pinIndex.get(id);
    if (i === undefined || !this.pinPoints) return;
    const attr = this.pinPoints.geometry.getAttribute("position") as THREE.BufferAttribute;
    const v = latLngToVector3(lat, lng, PIN_RADIUS);
    attr.setXYZ(i, v.x, v.y, v.z);
    attr.needsUpdate = true;
    if (this.activeId === id) this.marker.group.position.copy(latLngToVector3(lat, lng, globeRadius));
  }

  setActive(id: string | null, pin: Pin | null): void {
    this.activeId = id;
    if (!id || !pin) {
      this.marker.group.visible = false;
      return;
    }
    this.activePhase = hash01(id);
    this.marker.group.visible = true;
    const pos = latLngToVector3(pin.lat, pin.lng, globeRadius);
    this.marker.group.position.copy(pos);
    this.marker.group.lookAt(0, 0, 0);
    this.tintMarker(pin);
  }

  /** World position of a pin (for the HUD leader line). */
  pinWorld(pin: Pin, target = new THREE.Vector3()): THREE.Vector3 {
    return latLngToVector3(pin.lat, pin.lng, globeRadius, target);
  }

  /** Which pin is under a screen point? Only front-facing pins count. */
  pickPin(clientX: number, clientY: number): Pin | null {
    if (!this.pinPoints) return null;
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.params.Points = { threshold: 0.035 };
    const hits = this.raycaster.intersectObject(this.pinPoints, false);
    const camDir = this.camera.position.clone().normalize();
    for (const hit of hits) {
      const idx = hit.index;
      if (idx === undefined) continue;
      const pin = this.pinList[idx];
      if (!pin) continue;
      const dir = latLngToVector3(pin.lat, pin.lng, 1);
      if (dir.dot(camDir) > 0.15) return pin;
    }
    return null;
  }

  applyTheme(theme: Theme): void {
    this.theme = theme;
    const g = theme.globe;
    this.renderer.setClearColor(g.clear, 1);
    (this.scene.fog as THREE.FogExp2).color.setHex(g.clear);
    (this.scene.fog as THREE.FogExp2).density = g.fog;
    setColor(this.landMat, "uLand", g.land);
    setColor(this.landMat, "uCoast", g.coast);
    setColor(this.landMat, "uIce", g.ice);
    this.landMat.uniforms.uSunMix!.value = g.sun;
    setColor(this.bodyMat, "uDeep", g.bodyDeep);
    setColor(this.bodyMat, "uEdge", g.bodyEdge);
    this.meridianMat.color.setHex(g.meridian);
    this.meridianMat.opacity = g.meridianAlpha;
    setColor(this.atmoInner, "uColor", g.atmoInner);
    setColor(this.atmoOuter, "uColor", g.atmoOuter);
    this.atmoInner.uniforms.uStrength!.value = g.atmoInnerStrength;
    this.atmoOuter.uniforms.uStrength!.value = g.atmoOuterStrength;
    const blend = g.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const m of [this.atmoInner, this.atmoOuter, this.pinMat, this.starMat, this.starMatBig]) {
      m.blending = blend;
      m.needsUpdate = true;
    }
    this.starMat.color.setHex(g.stars);
    this.starMatBig.color.setHex(g.stars);
    this.starBaseAlpha = g.starAlpha;
    this.stars.visible = g.starAlpha > 0;
    this.starsBig.visible = g.starAlpha > 0;
    const colors = this.pinMat.uniforms.uColors!.value as THREE.Color[];
    colors[0]!.setHex(g.pinNature);
    colors[1]!.setHex(g.pinHuman);
    colors[2]!.setHex(g.pinLive);
    this.pinMat.uniforms.uAlpha!.value = theme.light ? 0.95 : 1;
    const markerMats = [this.marker.core, this.marker.halo, this.marker.pulse, this.marker.pulse2, this.marker.beam].map((m) => m.material as THREE.MeshBasicMaterial);
    for (const m of markerMats) {
      m.blending = m === (this.marker.beam.material as THREE.Material) ? blend : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    (this.marker.glow.material as THREE.SpriteMaterial).blending = blend;
    (this.marker.glow.material as THREE.SpriteMaterial).needsUpdate = true;
    const active = this.activeId ? this.pinList.find((p) => p.id === this.activeId) : null;
    if (active) this.tintMarker(active);
  }

  tick(): void {
    const t = this.clock.getElapsedTime();
    this.landMat.uniforms.uScale!.value = 1 + Math.sin(t * 0.35) * 0.03;
    this.pinMat.uniforms.uTime!.value = t;
    this.starMat.opacity = this.starBaseAlpha * (0.8 + Math.sin(t * 0.7) * 0.2);
    this.starMatBig.opacity = this.starBaseAlpha * (0.7 + Math.sin(t * 0.9 + 1.3) * 0.3);
    this.stars.rotation.y = t * 0.003;
    this.starsBig.rotation.y = t * 0.0022;
    sunDirection(new Date(), this.sun);

    if (this.marker.group.visible) {
      const m = this.marker;
      const wave = (t * 0.72 + this.activePhase) % 1;
      const wave2 = (t * 0.72 + this.activePhase + 0.5) % 1;
      m.pulse.scale.setScalar(1 + wave * 3.2);
      m.pulse2.scale.setScalar(1 + wave2 * 3.2);
      (m.pulse.material as THREE.MeshBasicMaterial).opacity = (1 - wave) * 0.7;
      (m.pulse2.material as THREE.MeshBasicMaterial).opacity = (1 - wave2) * 0.4;
      (m.glow.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(t * 3.2) * 0.2;
      m.beam.scale.y = 0.85 + Math.sin(t * 2.4) * 0.15;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const pr = Math.min(window.devicePixelRatio, 2);
    this.landMat.uniforms.uPixelRatio!.value = pr;
    this.pinMat.uniforms.uPixelRatio!.value = pr;
  }

  private tintMarker(pin: Pin): void {
    const g = this.theme?.globe;
    const family = pin.family === "nature" ? g?.pinNature : pin.family === "human" ? g?.pinHuman : g?.pinLive;
    const active = g?.active ?? 0xff9e64;
    const soft = family ?? 0x7dcfff;
    (this.marker.core.material as THREE.MeshBasicMaterial).color.setHex(active);
    (this.marker.halo.material as THREE.MeshBasicMaterial).color.setHex(active);
    (this.marker.pulse.material as THREE.MeshBasicMaterial).color.setHex(active);
    (this.marker.pulse2.material as THREE.MeshBasicMaterial).color.setHex(soft);
    (this.marker.glow.material as THREE.SpriteMaterial).color.setHex(active);
    (this.marker.beam.material as THREE.MeshBasicMaterial).color.setHex(active);
  }

  private makeMarker(): ActiveMarker {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 14), new THREE.MeshBasicMaterial({ color: 0xff9e64 }));
    core.position.set(0, 0, -0.014);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 24),
      new THREE.MeshBasicMaterial({ color: 0xff9e64, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    halo.position.set(0, 0, -0.003);
    const pulse = ring(0.024, 0.03, 0xff9e64);
    const pulse2 = ring(0.024, 0.03, 0x7dcfff);
    pulse.position.z = pulse2.position.z = -0.004;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9e64, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.scale.setScalar(0.16);
    glow.position.set(0, 0, -0.02);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0005, 0.18, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9e64, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, 0, -0.1);
    group.add(halo, pulse, pulse2, beam, glow, core);
    return { group, core, halo, pulse, pulse2, glow, beam };
  }

  private atmoMaterial(side: THREE.Side, power: number, strength: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side,
      uniforms: {
        uColor: { value: new THREE.Color(0x7dcfff) },
        uPower: { value: power },
        uStrength: { value: strength },
      },
      vertexShader: rimVert,
      fragmentShader: atmoFrag,
    });
  }

  private addGlobeBody(): void {
    const body = new THREE.Mesh(new THREE.SphereGeometry(globeRadius * 0.989, 80, 56), this.bodyMat);
    this.earth.add(body);
    const meridians = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(globeRadius * 0.991, 28, 18)),
      this.meridianMat,
    );
    this.earth.add(meridians);
  }

  private addLand(): void {
    const cloud = buildLandCloud(20000);
    if (cloud.positions.length < 900) {
      throw new Error(`Land point-cloud too sparse (${cloud.positions.length / 3} points)`);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
    geometry.setAttribute("aKind", new THREE.BufferAttribute(cloud.kind, 1));
    geometry.setAttribute("aCoast", new THREE.BufferAttribute(cloud.coast, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(cloud.sizes, 1));
    const points = new THREE.Points(geometry, this.landMat);
    points.renderOrder = 1;
    this.earth.add(points);
  }

  private addFallbackDots(): void {
    const count = 7000;
    const positions = new Float32Array(count * 3);
    const kind = new Float32Array(count);
    const coast = new Float32Array(count);
    const sizes = new Float32Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      positions[i * 3] = globeRadius * r * Math.cos(theta);
      positions[i * 3 + 1] = globeRadius * y;
      positions[i * 3 + 2] = globeRadius * r * Math.sin(theta);
      sizes[i] = 0.85;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    geometry.setAttribute("aCoast", new THREE.BufferAttribute(coast, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.earth.add(new THREE.Points(geometry, this.landMat));
  }

  private addAtmosphere(): void {
    const inner = new THREE.Mesh(new THREE.SphereGeometry(globeRadius * 1.012, 64, 48), this.atmoInner);
    const outer = new THREE.Mesh(new THREE.SphereGeometry(globeRadius * 1.14, 64, 48), this.atmoOuter);
    this.earth.add(inner, outer);
  }

  private makeStars(count: number, near: number, spread: number, material: THREE.PointsMaterial): THREE.Points {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = near + Math.random() * spread;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(geometry, material);
  }
}

function setColor(mat: THREE.ShaderMaterial, name: string, hex: number): void {
  (mat.uniforms[name]!.value as THREE.Color).setHex(hex);
}

function ring(inner: number, outer: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
}
