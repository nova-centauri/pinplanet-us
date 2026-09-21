import "./style.css";
import { Clock, Vector3 } from "three";
import { FlightRig } from "./flight";
import { GlobeScene } from "./globe";
import { todayKey } from "./otd";
import { loadCachedPins, loadPins, PinPool } from "./pins";
import { IssTracker, startProviders } from "./providers";
import { ISS_ID } from "./providers/iss";
import { idleSpin } from "./theme";
import { ThemeManager } from "./themes";
import { assertContinentHop, dwellFor, pickNextPin } from "./tour";
import type { Pin } from "./types";
import { Hud } from "./ui";

const canvas = document.getElementById("globe");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("canvas #globe missing");
}

// ── Scene, HUD, themes ──────────────────────────────────────────────────
const globe = new GlobeScene(canvas);
const flight = new FlightRig(globe.camera, globe.earth);
const hud = new Hud();
const themes = new ThemeManager();
themes.onChange((theme) => {
  globe.applyTheme(theme);
  flight.applyTheme(theme);
  hud.setTheme(theme.name);
});
themes.apply();

// ── Pin pool: seeds now, cache next, live feeds as they arrive ──────────
const pool = new PinPool();
pool.add(loadPins());
let renderedVersion = -1;

function syncPins(): void {
  if (pool.version === renderedVersion) return;
  renderedVersion = pool.version;
  globe.setPins(pool.pins);
  hud.setCounts(pool.size, pool.liveCount());
}
syncPins();

// Core pool now; the long tail once the first card is on screen.
let extraRequested = false;
void loadCachedPins("/data/pins.json")
  .then((pins) => {
    const added = pool.add(pins);
    console.info(`[pinplanet] cached pool: +${added} pins`);
    syncPins();
  })
  .catch((err) => console.warn("[pinplanet] cached pins unavailable; touring on seeds", err));

function loadExtraPins(): void {
  if (extraRequested) return;
  extraRequested = true;
  void loadCachedPins("/data/pins-extra.json")
    .then((pins) => {
      const added = pool.add(pins);
      console.info(`[pinplanet] extended pool: +${added} pins`);
      syncPins();
    })
    .catch((err) => console.warn("[pinplanet] extended pool unavailable", err));
}
window.setTimeout(loadExtraPins, 9000);

let breaking: Pin | null = null;
const shown = new Set<string>();

startProviders(({ provider, pins, fromCache }) => {
  const added = pool.add(pins);
  pool.sweep();
  syncPins();
  if (!fromCache && provider.id === "usgs") {
    // A big, fresh quake may cut in line once (planning/04 rule 4).
    const candidate = pins.find((p) => p.rank >= 0.68 && p.when && Date.now() - p.when < 6 * 3_600_000 && !shown.has(p.id));
    if (candidate) breaking = candidate;
  }
  if (added && !fromCache) console.info(`[pinplanet] ${provider.label}: +${added}`);
});

const iss = new IssTracker((pin) => {
  const existed = pool.byId.has(ISS_ID);
  pool.add([pin]);
  if (existed) {
    globe.movePin(ISS_ID, pin.lat, pin.lng);
    if (current?.id === ISS_ID) Object.assign(current, pin);
  } else syncPins();
});
iss.start();

window.setInterval(() => {
  if (pool.sweep()) syncPins();
}, 60_000);

// ── Tour state ──────────────────────────────────────────────────────────
let current: Pin | null = null;
let autoTour = true;
let dwellLeft = 0;
let dragging = false;
let dragDistance = 0;
let lastPointer = { x: 0, y: 0 };
const recent: string[] = [];
const RECENT_MAX = 60;

const first = pickNextPin(pool.pins, null);
beginJump(null, first, 4.1);

function beginJump(from: Pin | null, to: Pin, duration?: number): void {
  if (from) assertContinentHop(from, to);
  hud.hideCard();
  hud.setHop(from, to);
  hud.setMode(autoTour, true);
  globe.setActive(to.id, to);
  flight.start(from, to, duration);
  current = to;
  remember(to.id);
}

function onLanded(): void {
  if (!current) return;
  hud.showPin(current, { today: current.day === todayKey() });
  hud.setMode(autoTour, false);
  dwellLeft = dwellFor(current);
  loadExtraPins();
}

function jumpNow(): void {
  if (!current || flight.phase === "flying") return;
  let next: Pin | null = null;
  if (breaking && breaking.continent !== current.continent && pool.byId.has(breaking.id)) {
    next = breaking;
    breaking = null;
    hud.toast("Breaking: major earthquake");
  } else {
    next = pickNextPin(pool.pins, current, recent, { today: todayKey() });
  }
  beginJump(current, next);
}

function jumpTo(pin: Pin): void {
  if (!current || flight.phase === "flying" || pin.id === current.id) return;
  if (pin.continent === current.continent) {
    // Same continent: the V1 continent rule forbids the hop, so re-home the
    // camera by way of the pin's antipode neighbour is overkill — just show it.
    hud.toast(`${pin.title} — same continent, hop skipped`);
    return;
  }
  beginJump(current, pin);
}

function remember(id: string): void {
  shown.add(id);
  recent.push(id);
  if (recent.length > RECENT_MAX) recent.shift();
}

function setAuto(on: boolean): void {
  autoTour = on;
  hud.setMode(autoTour, flight.phase === "flying");
  hud.toast(on ? "Auto-tour resumed" : "Paused — press P or Resume to continue");
  if (on && flight.phase === "idle") dwellLeft = Math.min(dwellLeft, 2.5);
}

// ── Controls ────────────────────────────────────────────────────────────
document.getElementById("surprise")?.addEventListener("click", () => jumpNow());
document.getElementById("pause")?.addEventListener("click", () => setAuto(!autoTour));
document.getElementById("theme")?.addEventListener("click", () => cycleTheme(1));

function cycleTheme(step: number): void {
  const theme = themes.next(step);
  hud.toast(`${theme.name} — ${theme.tagline}`);
}

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  switch (event.code) {
    case "Space":
      event.preventDefault();
      jumpNow();
      break;
    case "KeyT":
      event.preventDefault();
      cycleTheme(event.shiftKey ? -1 : 1);
      break;
    case "KeyP":
      event.preventDefault();
      setAuto(!autoTour);
      break;
    default:
      break;
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (flight.phase !== "idle") return;
  dragging = true;
  dragDistance = 0;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  dragDistance += Math.abs(dx) + Math.abs(dy);
  lastPointer = { x: event.clientX, y: event.clientY };
  flight.orbit(-dx * 0.005, -dy * 0.004);
});
canvas.addEventListener("pointerup", (event) => {
  if (dragging) {
    if (dragDistance < 6) {
      const hit = globe.pickPin(event.clientX, event.clientY);
      if (hit) jumpTo(hit);
    } else {
      dwellLeft = Math.max(dwellLeft, 4);
    }
  }
  dragging = false;
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
window.addEventListener("resize", () => hud.invalidateLayout());

// ── Frame loop ──────────────────────────────────────────────────────────
const clock = new Clock();
const projected = new Vector3();
const pinDir = new Vector3();
const camDir = new Vector3();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  const landed = flight.update(dt);
  if (landed) onLanded();

  if (flight.phase === "idle" && !dragging) {
    flight.spin(idleSpin * dt);
    if (autoTour) {
      dwellLeft -= dt;
      if (dwellLeft <= 0 && current) {
        jumpNow();
      }
    }
  }

  hud.setClock(flight.phase === "flying" ? null : autoTour ? Math.max(0, dwellLeft) : null);

  syncPins();
  globe.tick();
  globe.render();
  updateLeader();
  requestAnimationFrame(frame);
}

function updateLeader(): void {
  if (!current || flight.phase !== "idle") {
    hud.updateLeader(0, 0, false);
    return;
  }
  globe.pinWorld(current, projected);
  pinDir.copy(projected).normalize();
  flight.viewDir(camDir);
  const facing = pinDir.dot(camDir);
  if (facing < 0.12) {
    hud.updateLeader(0, 0, false);
    return;
  }
  projected.project(globe.camera);
  const x = ((projected.x + 1) / 2) * window.innerWidth;
  const y = ((1 - projected.y) / 2) * window.innerHeight;
  hud.updateLeader(x, y, true);
}

requestAnimationFrame(frame);

// Debug handle for the console and headless checks: window.__pinplanet
declare global {
  interface Window {
    __pinplanet?: { globe: GlobeScene; flight: FlightRig; pool: PinPool; themes: ThemeManager; setAuto: (on: boolean) => void; jumpNow: () => void };
  }
}
window.__pinplanet = { globe, flight, pool, themes, setAuto, jumpNow };
