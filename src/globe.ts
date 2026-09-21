import * as THREE from "three";
import { latLngToVector3 } from "./geo";
import { buildLandPositions } from "./land";
import { globeRadius, theme } from "./theme";
import type { Pin } from "./types";

export interface PinMarker {
  id: string;
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  pulse: THREE.Mesh;
}

export class GlobeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly earth: THREE.Group;
  readonly markers = new Map<string, PinMarker>();

  private readonly pulseClock = new THREE.Clock();
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
    this.scene.fog = new THREE.FogExp2(theme.bg, 0.035);

    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      80,
    );
    this.camera.position.set(0, 0.4, 5.4);

    this.earth = new THREE.Group();
    this.scene.add(this.earth);

    this.addStars();
    this.addGlobeBody();
    this.addLand();
    this.addAtmosphere();

    window.addEventListener("resize", () => this.resize());
  }

  addPins(pins: Pin[]): void {
    for (const pin of pins) {
      const group = new THREE.Group();
      const pos = latLngToVector3(pin.lat, pin.lng, globeRadius);
      group.position.copy(pos);
      group.lookAt(0, 0, 0);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.016, 14, 14),
        new THREE.MeshBasicMaterial({ color: theme.cyan }),
      );
      core.position.set(0, 0, -0.022);

      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.038, 24),
        new THREE.MeshBasicMaterial({
          color: theme.blue,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      halo.position.set(0, 0, -0.004);

      const pulse = new THREE.Mesh(
        new THREE.RingGeometry(0.04, 0.05, 28),
        new THREE.MeshBasicMaterial({
          color: theme.cyan,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      pulse.position.set(0, 0, -0.006);

      group.add(halo, pulse, core);
      this.earth.add(group);
      this.markers.set(pin.id, { id: pin.id, group, core, halo, pulse });
    }
  }

  setActive(id: string | null): void {
    this.activeId = id;
    for (const marker of this.markers.values()) {
      const on = marker.id === id;
      const coreMat = marker.core.material as THREE.MeshBasicMaterial;
      const haloMat = marker.halo.material as THREE.MeshBasicMaterial;
      coreMat.color.setHex(on ? theme.orange : theme.cyan);
      haloMat.color.setHex(on ? theme.orange : theme.blue);
      haloMat.opacity = on ? 0.75 : 0.35;
      marker.core.scale.setScalar(on ? 1.55 : 1);
    }
  }

  pinWorldPosition(id: string, target = new THREE.Vector3()): THREE.Vector3 {
    const marker = this.markers.get(id);
    if (!marker) return target.set(0, 0, 0);
    this.earth.updateMatrixWorld();
    return marker.group.getWorldPosition(target);
  }

  tick(): void {
    const t = this.pulseClock.getElapsedTime();
    if (!this.activeId) return;
    const marker = this.markers.get(this.activeId);
    if (!marker) return;
    const wave = (t % 1.8) / 1.8;
    marker.pulse.scale.setScalar(1 + wave * 2.4);
    (marker.pulse.material as THREE.MeshBasicMaterial).opacity = (1 - wave) * 0.55;
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
  }

  private addGlobeBody(): void {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius * 0.992, 64, 48),
      new THREE.MeshBasicMaterial({ color: theme.bgDeep }),
    );
    this.earth.add(body);

    const meridians = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(globeRadius * 0.993, 24, 16)),
      new THREE.LineBasicMaterial({
        color: theme.comment,
        transparent: true,
        opacity: 0.08,
      }),
    );
    this.earth.add(meridians);
  }

  private addLand(): void {
    const positions = buildLandPositions(15500);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: theme.fg,
        size: 0.013,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      }),
    );
    this.earth.add(points);
  }

  private addAtmosphere(): void {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
          gl_FragColor = vec4(0.48, 0.64, 0.97, f * 0.28);
        }
      `,
    });
    this.earth.add(new THREE.Mesh(new THREE.SphereGeometry(globeRadius * 1.08, 48, 32), material));
  }

  private addStars(): void {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 28;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: theme.fg,
          size: 0.035,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
  }
}
