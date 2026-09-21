import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatesForDay, formatYear, isTightDescription, isTightPage, otdFact, type OtdEvent } from "./otd";

test("tight-location rule on descriptions", () => {
  assert.equal(isTightDescription("Country in Southeast Europe"), false);
  assert.equal(isTightDescription("capital city of Brazil"), false);
  assert.equal(isTightDescription("city in northeastern Italy"), false);
  assert.equal(isTightDescription("Bicameral legislature of the United States"), false);
  assert.equal(isTightDescription("Provincial capital of Khövsgöl Province, Mongolia"), false);
  assert.equal(isTightDescription("sovereign city-state in Southern Europe"), false);
  assert.equal(isTightDescription("1815 battle during the War of the Seventh Coalition"), true);
  assert.equal(isTightDescription("Earthquake in Northwestern Albania"), true);
  assert.equal(isTightDescription("Late medieval fieldstone church in Tyrvää, Finland"), true);
  assert.equal(isTightDescription("meteorite impact crater in northern Arizona"), true);
  assert.equal(isTightDescription("desert plateau in South America"), true);
  assert.equal(isTightDescription("volcano in Ethiopia"), true);
  assert.equal(isTightDescription(""), true);
});

test("pages need earth coordinates and a standard type", () => {
  assert.equal(isTightPage({ title: "Tranquility_Base", coordinates: { lat: 0, lon: 23, globe: "moon" } }), false);
  assert.equal(isTightPage({ title: "Battle_of_Waterloo", coordinates: { lat: 50.6, lon: 4.4 }, description: "1815 battle" }), true);
  assert.equal(isTightPage({ title: "Battle_of_Waterloo", coordinates: { lat: 50.6, lon: 4.4 }, type: "disambiguation" }), false);
  assert.equal(isTightPage({ title: "Battle_of_Waterloo" }), false);
});

test("candidatesForDay picks the event page, not the country", () => {
  const events: OtdEvent[] = [
    {
      year: 2019,
      text: "A 5.6 Mw earthquake shakes the Albanian port of Durrës.",
      pages: [
        { title: "Albania", description: "Country in Southeast Europe", coordinates: { lat: 41, lon: 20 } },
        { title: "2019_Albania_earthquake", description: "Earthquake in Northwestern Albania", coordinates: { lat: 41.5, lon: 19.5 }, thumbnail: { source: "https://thumb.wikimedia.org/x.jpg?utm=1" } },
      ],
    },
    { year: 1991, text: "Armenia gains independence from the Soviet Union.", pages: [{ title: "Armenia", description: "Country in West Asia", coordinates: { lat: 40, lon: 44 } }] },
  ];
  const cands = candidatesForDay(events);
  assert.equal(cands.length, 1);
  assert.equal(cands[0]!.title, "2019 Albania earthquake");
  assert.equal(cands[0]!.image, "https://upload.wikimedia.org/x.jpg");
  assert.equal(cands[0]!.url, "https://en.wikipedia.org/wiki/2019_Albania_earthquake");
});

test("otdFact stays within 280 characters and formats eras", () => {
  const long = "word ".repeat(80).trim();
  const fact = otdFact(-44, long);
  assert.ok(fact.length <= 280, `too long: ${fact.length}`);
  assert.ok(fact.startsWith("44 BCE — "));
  assert.equal(formatYear(1969), "1969");
  assert.equal(formatYear(79), "79 CE");
  assert.equal(otdFact(1969, "Apollo 11 lands."), "1969 — Apollo 11 lands.");
});
