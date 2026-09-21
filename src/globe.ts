import * as THREE from "three";
import { hash01, latLngToVector3 } from "./geo";
import { glowTexture } from "./glow";
import { buildLandCloud } from "./land";
import { globeRadius, theme } from "./theme";
import type { Pin } from "./types";

export interface PinMarker {
  id: string;
  phase: number;
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  pulse: THREE.Mesh;
  pulse2: THREE.Mesh;
  glow: THREE.Sprite;
  beam: THREE.Mesh;
}

const landVert = `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
uniform float uScale;
varying vec3 vColor;
varying float vFacing;
void main() {
  vColor = aColor;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(world.xyz);
  vec3 viewDir = normalize(cameraPosition - world.xyz);
  vFacing = max(dot(n, viewDir), 0.0);
  vec4 mv = viewMatrix * world;
  float dist = max(-mv.z, 1.4);
  gl_PointSize = max(1.25, aSize * uScale * uPixelRatio * (9.8 / dist));
  gl_Position = projectionMatrix * mv;
}
`;

const landFrag = `
varying vec3 vColor;
varying float vFacing;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 0.62) discard;
  float core = 1.0 - smoothstep(0.08, 0.62, d);
  float depth = 0.34 + 0.66 * pow(vFacing, 0.7);
  gl_FragColor = vec4(vColor, core * depth);
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

export class GlobeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly earth: THREE.Group;
  readonly markers = new Map<string, PinMarker>();

  private readonly clock = new THREE.Clock();
  private readonly landMat: THREE.ShaderMaterial;
  private readonly starMat: THREE.PointsMaterial;
  private readonly stars: THREE.Points;
  private activeId: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(theme.bg, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(theme.bg, 0.022);

    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.08,
      120,
    );
    this.camera.position.set(0, 0.55, 6.4);

    this.earth = new THREE.Group();
    this.scene.add(this.earth);

    this.landMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uScale: { value: 1 },
      },
      vertexShader: landVert,
      fragmentShader: landFrag,
    });

    this.starMat = new THREE.PointsMaterial({
      color: theme.fg,
      size: 0.04,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.stars = this.makeStars();
    this.scene.add(this.stars);
    this.addGlobeBody();
    try {
      this.addLand();
    } catch (error) {
      console.warn("Land point-cloud failed; using sparse sphere", error);
      this.addFallbackDots();
    }
    this.addAtmosphere();

    window.addEventListener("resize", () => this.resize());
  }

  addPins(pins: Pin[]): void {
    const glow = glowTexture();
    for (const pin of pins) {
      const group = new THREE.Group();
      const pos = latLngToVector3(pin.lat, pin.lng, globeRadius);
      group.position.copy(pos);
      group.lookAt(0, 0, 0);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 14, 14),
        new THREE.MeshBasicMaterial({ color: theme.cyan }),
      );
      core.position.set(0, 0, -0.014);

      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.022, 22),
        new THREE.MeshBasicMaterial({
          color: theme.blue,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      halo.position.set(0, 0, -0.003);

      const pulse = ring(0.024, 0.03, theme.cyan);
      const pulse2 = ring(0.024, 0.03, theme.blue);
      pulse.position.z = pulse2.position.z = -0.004;

      const glowSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow,
          color: theme.cyan,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glowSprite.scale.setScalar(0.07);
      glowSprite.position.set(0, 0, -0.02);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0016, 0.0005, 0.18, 8),
        new THREE.MeshBasicMaterial({
          color: theme.cyan,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      beam.rotation.x = Math.PI / 2;
      beam.position.set(0, 0, -0.1);

      group.add(halo, pulse, pulse2, beam, glowSprite, core);
      this.earth.add(group);
      this.markers.set(pin.id, {
        id: pin.id,
        phase: hash01(pin.id),
        group,
        core,
        halo,
        pulse,
        pulse2,
        glow: glowSprite,
        beam,
      });
    }
  }

  setActive(id: string | null): void {
    this.activeId = id;
    for (const marker of this.markers.values()) {
      const on = marker.id === id;
      const coreMat = marker.core.material as THREE.MeshBasicMaterial;
      const haloMat = marker.halo.material as THREE.MeshBasicMaterial;
      const glowMat = marker.glow.material as THREE.SpriteMaterial;
      const beamMat = marker.beam.material as THREE.MeshBasicMaterial;
      coreMat.color.setHex(on ? theme.orange : theme.cyan);
      haloMat.color.setHex(on ? theme.orange : theme.blue);
      haloMat.opacity = on ? 0.8 : 0.32;
      glowMat.color.setHex(on ? theme.orange : theme.cyan);
      marker.core.scale.setScalar(on ? 1.7 : 1);
      marker.glow.scale.setScalar(on ? 0.14 : 0.07);
      beamMat.opacity = on ? 0.7 : 0;
      beamMat.color.setHex(on ? theme.orange : theme.cyan);
    }
  }

  tick(): void {
    const t = this.clock.getElapsedTime();
    this.landMat.uniforms.uScale!.value = 1 + Math.sin(t * 0.35) * 0.03;
    this.starMat.opacity = 0.48 + Math.sin(t * 0.7) * 0.12;
    this.stars.rotation.y = t * 0.003;

    for (const marker of this.markers.values()) {
      const on = marker.id === this.activeId;
      const wave = (t * (on ? 0.72 : 0.28) + marker.phase) % 1;
      const wave2 = (t * (on ? 0.72 : 0.28) + marker.phase + 0.5) % 1;
      marker.pulse.scale.setScalar(1 + wave * (on ? 3.2 : 1.6));
      marker.pulse2.scale.setScalar(1 + wave2 * (on ? 3.2 : 1.6));
      (marker.pulse.material as THREE.MeshBasicMaterial).opacity = (1 - wave) * (on ? 0.7 : 0.16);
      (marker.pulse2.material as THREE.MeshBasicMaterial).opacity = (1 - wave2) * (on ? 0.4 : 0.08);
      const glowMat = marker.glow.material as THREE.SpriteMaterial;
      glowMat.opacity = on ? 0.55 + Math.sin(t * 3.2) * 0.2 : 0.22;
      if (on) {
        marker.beam.scale.y = 0.85 + Math.sin(t * 2.4) * 0.15;
      }
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
    this.landMat.uniforms.uPixelRatio!.value = Math.min(window.devicePixelRatio, 2);
  }

  private addGlobeBody(): void {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius * 0.989, 80, 56),
      new THREE.ShaderMaterial({
        vertexShader: rimVert,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
            float rim = pow(1.0 - facing, 2.6);
            vec3 deep = vec3(0.027, 0.031, 0.05);
            vec3 edge = vec3(0.18, 0.24, 0.42);
            gl_FragColor = vec4(mix(deep, edge, rim * 0.85), 1.0);
          }
        `,
      }),
    );
    this.earth.add(body);

    const meridians = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(globeRadius * 0.991, 28, 18)),
      new THREE.LineBasicMaterial({
        color: theme.comment,
        transparent: true,
        opacity: 0.07,
      }),
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
    geometry.setAttribute("aColor", new THREE.BufferAttribute(cloud.colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(cloud.sizes, 1));
    const points = new THREE.Points(geometry, this.landMat);
    points.renderOrder = 1;
    this.earth.add(points);
  }

  private addFallbackDots(): void {
    const count = 7000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      positions[i * 3] = globeRadius * r * Math.cos(theta);
      positions[i * 3 + 1] = globeRadius * y;
      positions[i * 3 + 2] = globeRadius * r * Math.sin(theta);
      colors[i * 3] = 0.75;
      colors[i * 3 + 1] = 0.79;
      colors[i * 3 + 2] = 0.96;
      sizes[i] = 0.85;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.earth.add(new THREE.Points(geometry, this.landMat));
  }

  private addAtmosphere(): void {
    const frag = `
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

    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius * 1.012, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        uniforms: {
          uColor: { value: new THREE.Color(0x7dcfff) },
          uPower: { value: 3.2 },
          uStrength: { value: 0.28 },
        },
        vertexShader: rimVert,
        fragmentShader: frag,
      }),
    );

    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius * 1.14, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        uniforms: {
          uColor: { value: new THREE.Color(0x7aa2f7) },
          uPower: { value: 2.05 },
          uStrength: { value: 0.46 },
        },
        vertexShader: rimVert,
        fragmentShader: frag,
      }),
    );

    this.earth.add(inner, outer);
  }

  private makeStars(): THREE.Points {
    const count = 2800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 16 + Math.random() * 36;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(geometry, this.starMat);
  }
}

function ring(inner: number, outer: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}
