import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPins } from "./pins";
import { assertContinentHop, dwellFor, pickNextPin } from "./tour";
import type { Pin } from "./types";

test("seed pins span multiple continents", () => {
  const pins = loadPins();
  const continents = new Set(pins.map((pin) => pin.continent));
  assert.ok(pins.length >= 8, "need a tourable pin set");
  assert.ok(continents.size >= 3, "continent rule needs more than one continent");
  for (const pin of pins) {
    assert.ok(pin.continent, `${pin.id} missing continent`);
    assert.ok(pin.family, `${pin.id} missing family`);
  }
});

test("every hop lands on a different continent", () => {
  const pins = loadPins();
  let previous = pickNextPin(pins, null);
  for (let i = 0; i < 300; i++) {
    const next = pickNextPin(pins, previous, [previous.id]);
    assert.notEqual(next.continent, previous.continent, `${previous.id} → ${next.id}`);
    assertContinentHop(previous, next);
    previous = next;
  }
});

test("assertContinentHop rejects a same-continent jump", () => {
  const pins = loadPins();
  const first = pins[0]!;
  const same = pins.find((pin) => pin.id !== first.id && pin.continent === first.continent);
  if (!same) throw new Error("need two pins on one continent");
  assert.throws(() => assertContinentHop(first, same), /Illegal hop/);
});

function fake(id: string, category: string, continent: Pin["continent"], extra: Partial<Pin> = {}): Pin {
  return {
    id,
    title: id,
    category,
    family: "human",
    lat: 0,
    lng: 0,
    fact: "x".repeat(120),
    storyUrl: "https://example.org",
    storyLabel: "",
    source: "test",
    added: "2026-01-01",
    continent,
    imageUrl: "",
    credit: "",
    rank: 0.5,
    ...extra,
  };
}

test("categories are interleaved: a huge category does not drown a small one", () => {
  const pins: Pin[] = [];
  for (let i = 0; i < 900; i++) pins.push(fake(`big-${i}`, "historical", i % 2 ? "asia" : "europe"));
  for (let i = 0; i < 30; i++) pins.push(fake(`small-${i}`, "shipwreck", i % 2 ? "asia" : "europe"));
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let previous = pins[0]!;
  let small = 0;
  const recent: string[] = [];
  for (let i = 0; i < 2000; i++) {
    const next = pickNextPin(pins, previous, recent, { random });
    if (next.category === "shipwreck") small += 1;
    recent.push(next.id);
    if (recent.length > 60) recent.shift();
    previous = next;
  }
  // Proportional would be ~3%; sqrt weighting should land well above that.
  assert.ok(small > 2000 * 0.08, `small category got only ${small}/2000 picks`);
  assert.ok(small < 2000 * 0.5, `small category dominates: ${small}/2000`);
});

test("today-in-history and live pins get a boost", () => {
  const pins: Pin[] = [];
  for (let i = 0; i < 200; i++) pins.push(fake(`p-${i}`, "historical", "asia"));
  pins.push(fake("today", "historical", "asia", { day: "09-21" }));
  const previous = fake("prev", "site", "europe");
  let seed = 3;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let hits = 0;
  for (let i = 0; i < 1000; i++) {
    if (pickNextPin(pins, previous, [], { today: "09-21", random }).id === "today") hits += 1;
  }
  assert.ok(hits > 15, `today pin picked ${hits}/1000 — expected a clear boost over 5`);
});

test("dwell time scales with fact length within bounds", () => {
  const short = fake("s", "site", "asia", { fact: "Short." });
  const long = fake("l", "site", "asia", { fact: "x".repeat(280) });
  assert.ok(dwellFor(short) >= 5.5);
  assert.ok(dwellFor(long) <= 12);
  assert.ok(dwellFor(long) > dwellFor(short));
});

test("thin continents get airtime: a 9:1 pool does not become a 9:1 tour", () => {
  const pins: Pin[] = [];
  for (let i = 0; i < 900; i++) pins.push(fake(`eu-${i}`, "site", "europe"));
  for (let i = 0; i < 100; i++) pins.push(fake(`af-${i}`, "site", "africa"));
  for (let i = 0; i < 100; i++) pins.push(fake(`as-${i}`, "site", "asia"));
  const previous = fake("prev", "site", "asia");
  let seed = 11;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let europe = 0;
  const picks = 3000;
  for (let i = 0; i < picks; i++) {
    if (pickNextPin(pins, previous, [], { random }).continent === "europe") europe += 1;
  }
  // Proportional would be 90%; the lift pulls it down without inverting it.
  assert.ok(europe / picks < 0.8, `europe took ${europe}/${picks}`);
  assert.ok(europe / picks > 0.5, `europe only ${europe}/${picks}`);
});
