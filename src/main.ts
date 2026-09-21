import "./style.css";
import { Clock } from "three";
import { FlightRig } from "./flight";
import { GlobeScene } from "./globe";
import { loadPins } from "./pins";
import { dwellDuration, idleSpin } from "./theme";
import { assertContinentHop, pickNextPin } from "./tour";
import type { Pin } from "./types";
import { Hud } from "./ui";

const pins = loadPins();
const canvas = document.getElementById("globe");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("canvas #globe missing");
}

const globe = new GlobeScene(canvas);
globe.addPins(pins);

const flight = new FlightRig(globe.camera, globe.earth);
const hud = new Hud();

let current: Pin | null = null;
let autoTour = true;
let dwellLeft = 0;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
const recent: string[] = [];

const first = pickNextPin(pins, null);
beginJump(null, first, 4.1);

const surprise = document.getElementById("surprise");
surprise?.addEventListener("click", () => jumpNow());
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    jumpNow();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (flight.phase !== "idle") return;
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  lastPointer = { x: event.clientX, y: event.clientY };
  flight.orbit(-dx * 0.005, -dy * 0.004);
});
canvas.addEventListener("pointerup", () => {
  dragging = false;
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});

const clock = new Clock();

function beginJump(from: Pin | null, to: Pin, duration?: number): void {
  if (from) assertContinentHop(from, to);
  hud.hideCard();
  hud.setHop(from, to);
  hud.setMode(autoTour, true);
  globe.setActive(to.id);
  flight.start(from, to, duration);
  current = to;
  remember(to.id);
}

function onLanded(): void {
  if (!current) return;
  hud.showPin(current);
  hud.setMode(autoTour, false);
  dwellLeft = dwellDuration;
}

function jumpNow(): void {
  if (!current || flight.phase === "flying") return;
  const next = pickNextPin(pins, current, recent);
  beginJump(current, next);
}

function remember(id: string): void {
  recent.push(id);
  if (recent.length > 8) recent.shift();
}

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

  globe.tick();
  globe.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
