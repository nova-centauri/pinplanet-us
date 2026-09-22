import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { imageFor, isPhotoUrl } from "./imagery";
import { toPin } from "./pins";
import type { SeedPin } from "./types";

/**
 * The cached pool (public/data/pins.json) is a build artefact committed to
 * the repo. These tests are the contract the app relies on.
 */

const CONTINENTS = new Set(["africa", "antarctica", "asia", "europe", "north-america", "oceania", "south-america"]);
const CATEGORIES = new Set([
  "site",
  "geography",
  "event",
  "historical",
  "current topic",
  "random fact",
  "random place",
  "natural disaster",
  "world record",
  "volcano",
  "earthquake",
  "impact",
  "fossil",
  "battle",
  "ancient",
  "shipwreck",
  "science",
]);

function loadCore(): SeedPin[] {
  return JSON.parse(readFileSync(new URL("../public/data/pins.json", import.meta.url), "utf8")) as SeedPin[];
}

function load(): SeedPin[] {
  const extra = JSON.parse(readFileSync(new URL("../public/data/pins-extra.json", import.meta.url), "utf8")) as SeedPin[];
  return [...loadCore(), ...extra];
}

test("cache holds at least 1,000 pins with unique ids — in the core file alone", () => {
  const core = loadCore();
  assert.ok(core.length >= 1000, `only ${core.length} core pins`);
  const pins = load();
  const ids = new Set(pins.map((p) => p.id));
  assert.equal(ids.size, pins.length, "duplicate ids across core + extra");
  const categories = new Set(core.map((p) => p.category));
  assert.ok(categories.size >= 10, "core should represent every category");
});

test("every cached pin follows the schema", () => {
  for (const p of load()) {
    assert.ok(p.id && /^[a-z0-9-]+$/.test(p.id), `bad id ${p.id}`);
    assert.ok(p.title.length > 0, `${p.id}: title`);
    assert.ok(CATEGORIES.has(p.category), `${p.id}: category ${p.category}`);
    assert.ok(Number.isFinite(p.lat) && Math.abs(p.lat) <= 90, `${p.id}: lat`);
    assert.ok(Number.isFinite(p.lng) && Math.abs(p.lng) <= 180, `${p.id}: lng`);
    assert.ok(p.fact.length >= 40 && p.fact.length <= 280, `${p.id}: fact length ${p.fact.length}`);
    assert.ok(/^https:\/\//.test(p.story_url), `${p.id}: story_url`);
    assert.ok(p.story_label.length > 0, `${p.id}: story_label`);
    assert.ok(p.source.length > 0, `${p.id}: source`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.added), `${p.id}: added`);
    assert.ok(p.continent && CONTINENTS.has(p.continent), `${p.id}: continent ${p.continent}`);
    if (p.image_url) assert.ok(/^https:\/\//.test(p.image_url), `${p.id}: image_url`);
    if (p.day) assert.ok(/^\d{2}-\d{2}$/.test(p.day), `${p.id}: day ${p.day}`);
    if (p.year !== undefined) assert.ok(Number.isInteger(p.year), `${p.id}: year`);
  }
});

test("cache covers the promised sources and categories", () => {
  const pins = load();
  const sources = new Set(pins.map((p) => p.source));
  for (const s of ["wikidata", "wikipedia", "wikipedia-otd", "gvp", "pbdb"]) assert.ok(sources.has(s), `missing source ${s}`);
  const categories = new Set(pins.map((p) => p.category));
  for (const c of ["volcano", "battle", "fossil", "impact", "earthquake", "historical", "geography", "site", "shipwreck", "science", "ancient"])
    assert.ok(categories.has(c), `missing category ${c}`);
  const continents = new Set(pins.map((p) => p.continent));
  assert.ok(continents.size >= 6, "cache should reach at least six continents");
  const withDay = pins.filter((p) => p.day).length;
  assert.ok(withDay >= 300, `only ${withDay} on-this-day pins`);
  const withImage = pins.filter((p) => p.image_url).length;
  assert.ok(withImage / pins.length > 0.9, `only ${withImage}/${pins.length} pins carry a photo (the rest get a satellite view)`);
  assert.ok(categories.has("natural disaster"), "missing category natural disaster");
  assert.ok(categories.has("site") && pins.filter((p) => p.category === "site").length >= 600, "built structures should be in the pool");
});

test("stored photos are photos: no maps, flags, logos or SVG renders", () => {
  const bad = load().filter((p) => p.image_url && !isPhotoUrl(p.image_url));
  assert.deepEqual(bad.map((p) => p.id).slice(0, 10), [], `${bad.length} pins store a non-photo image_url`);
});

test("every pin resolves to a card image", () => {
  for (const raw of load()) {
    const image = imageFor(toPin(raw));
    assert.ok(image.url.startsWith("https://"), `${raw.id}: no image`);
    assert.ok(image.kind === "photo" || image.kind === "satellite");
  }
});

test("cached pins convert to app pins", () => {
  for (const raw of load().slice(0, 200)) {
    const pin = toPin(raw);
    assert.equal(pin.id, raw.id);
    assert.ok(pin.family);
    assert.ok(pin.rank >= 0 && pin.rank <= 1);
  }
});
