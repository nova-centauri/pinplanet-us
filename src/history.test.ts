import assert from "node:assert/strict";
import { test } from "node:test";
import { agoLabel, History, type Visit, type VisitStore } from "./history";

function memoryStore(initial: Visit[] | null = null): VisitStore & { saved: Visit[] | null } {
  const store = {
    saved: initial,
    read: () => store.saved,
    write: (entries: Visit[]) => {
      store.saved = entries.map((v) => ({ ...v }));
    },
  };
  return store;
}

test("visits append; back and forward walk the log without adding to it", () => {
  const h = new History(80);
  assert.equal(h.current, null);
  assert.equal(h.canBack, false);
  h.push("a", 1);
  h.push("b", 2);
  h.push("c", 3);
  assert.deepEqual(h.entries.map((v) => v.id), ["a", "b", "c"]);
  assert.equal(h.current?.id, "c");
  assert.equal(h.canForward, false);

  assert.equal(h.back()?.id, "b");
  assert.equal(h.back()?.id, "a");
  assert.equal(h.back(), null, "nothing before the first visit");
  assert.equal(h.entries.length, 3, "walking back does not append");
  assert.equal(h.forward()?.id, "b");
  assert.equal(h.canForward, true);

  // A new arrival while in the middle appends at the end and moves the cursor there.
  h.push("d", 4);
  assert.deepEqual(h.entries.map((v) => v.id), ["a", "b", "c", "d"]);
  assert.equal(h.current?.id, "d");
  assert.equal(h.back()?.id, "c");
});

test("re-arriving at the current pin only refreshes its timestamp", () => {
  const h = new History(80);
  h.push("a", 1);
  h.push("a", 5);
  assert.equal(h.entries.length, 1);
  assert.equal(h.entries[0]?.at, 5);
});

test("the log is capped and persisted through the store", () => {
  const store = memoryStore();
  const h = new History(3, store);
  for (const id of ["a", "b", "c", "d", "e"]) h.push(id, 1);
  assert.deepEqual(h.entries.map((v) => v.id), ["c", "d", "e"]);
  assert.deepEqual(store.saved?.map((v) => v.id), ["c", "d", "e"]);

  const restored = new History(3, store);
  assert.deepEqual(restored.entries.map((v) => v.id), ["c", "d", "e"]);
  assert.equal(restored.cursor, -1, "a fresh session starts with no current pin");
  restored.push("f", 2);
  assert.equal(restored.back()?.id, "e", "back reaches into the previous session");
});

test("recentIds returns the newest n in visit order and change listeners fire", () => {
  const h = new History(80);
  let changes = 0;
  h.onChange(() => (changes += 1));
  for (const id of ["a", "b", "c", "d"]) h.push(id, 1);
  assert.deepEqual(h.recentIds(2), ["c", "d"]);
  assert.equal(changes, 4);
  h.goto(0);
  assert.equal(h.current?.id, "a");
  assert.equal(changes, 5);
});

test("agoLabel reads naturally", () => {
  assert.equal(agoLabel(10_000), "just now");
  assert.equal(agoLabel(4 * 60_000), "4 min ago");
  assert.equal(agoLabel(3 * 3_600_000), "3 h ago");
  assert.equal(agoLabel(26 * 3_600_000), "yesterday");
  assert.equal(agoLabel(5 * 86_400_000), "5 days ago");
});
