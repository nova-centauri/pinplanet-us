import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanExtract, composeFact, dateLabel, eraYear, fitSentences, sentences, slugify } from "./text";

test("sentence splitting respects abbreviations", () => {
  const s = sentences("Mt. Fuji is tall. It last erupted in 1707. St. Helens is in the U.S. It erupted in 1980.");
  assert.deepEqual(s, ["Mt. Fuji is tall.", "It last erupted in 1707.", "St. Helens is in the U.S. It erupted in 1980."]);
});

test("cleanExtract strips pronunciation noise but keeps numbers", () => {
  assert.equal(cleanExtract("Velociraptor (; lit. 'swift thief') is a genus."), "Velociraptor is a genus.");
  assert.equal(cleanExtract("Krakatoa (), also transcribed Krakatau (), is a caldera."), "Krakatoa, also transcribed Krakatau, is a caldera.");
  assert.equal(cleanExtract("K2, at 8,611 metres (28,251 ft) above sea level, is high."), "K2, at 8,611 metres (28,251 ft) above sea level, is high.");
  assert.equal(
    cleanExtract("Mount Everest (known in Nepali as Sagarmāthā, and in Tibetan as Jomolangma is the highest mountain. It lies in the Himalayas."),
    "Mount Everest is the highest mountain. It lies in the Himalayas.",
  );
});

test("composeFact keeps the hook and never exceeds 280 characters", () => {
  const body = "Sentence one is here. ".repeat(30);
  const fact = composeFact("Stratovolcano, 3,776 m. Last erupted 1707.", body);
  assert.ok(fact.startsWith("Stratovolcano, 3,776 m. Last erupted 1707. Sentence one is here."));
  assert.ok(fact.length <= 280);
  assert.ok(fitSentences("A".repeat(400), 100).endsWith("…"));
});

test("dates and eras", () => {
  assert.equal(dateLabel("1815-06-18T00:00:00Z"), "18 June 1815");
  assert.equal(dateLabel("-0479-01-01T00:00:00Z"), "479 BCE");
  assert.equal(dateLabel("1906-01-01T00:00:00Z"), "1906");
  assert.equal(eraYear(-8300), "8,300 BCE");
  assert.equal(slugify("Ħal Saflieni Hypogeum / Malta"), "hal-saflieni-hypogeum-malta");
});
