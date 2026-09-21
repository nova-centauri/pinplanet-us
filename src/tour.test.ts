import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPins } from "./pins";
import { assertContinentHop, pickNextPin } from "./tour";

test("seed pins span multiple continents", () => {
  const pins = loadPins();
  const continents = new Set(pins.map((pin) => pin.continent));
  assert.ok(pins.length >= 8, "need a tourable pin set");
  assert.ok(continents.size >= 3, "continent rule needs more than one continent");
  for (const pin of pins) {
    assert.ok(pin.continent, `${pin.id} missing continent`);
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
