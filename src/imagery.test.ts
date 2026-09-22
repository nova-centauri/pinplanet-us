import assert from "node:assert/strict";
import { test } from "node:test";
import { imageFor, inverseMercator, isPhotoUrl, satelliteUrl, satelliteZoom, sizedImage } from "./imagery";
import type { Pin } from "./types";

function pin(extra: Partial<Pin> = {}): Pin {
  return {
    id: "x",
    title: "Somewhere",
    category: "site",
    family: "human",
    lat: 40.7,
    lng: -74,
    fact: "f".repeat(60),
    storyUrl: "https://example.org",
    storyLabel: "",
    source: "test",
    added: "2026-01-01",
    continent: "north-america",
    imageUrl: "",
    credit: "",
    rank: 0.5,
    ...extra,
  };
}

test("photo classifier rejects maps, flags, logos, shakemaps and SVG renders", () => {
  const bad = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Hadrians_Wall_map.svg/960px-Hadrians_Wall_map.svg.png",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Battle_of_Kursk_%28map%29.jpg/640px-Battle_of_Kursk_%28map%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Shakemap_us10003re5_highres.jpg/640px-Shakemap_us10003re5_highres.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/La_Brea_Tar_Pits_logo.svg/640px-La_Brea_Tar_Pits_logo.svg.png",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Flag_of_Peru.svg/640px-Flag_of_Peru.svg.png",
    "https://upload.wikimedia.org/wikipedia/commons/e/e0/Sumatra_2007_earthquakes_map.gif",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Coat_of_arms_of_Hallstatt.png/640px-Coat_of_arms_of_Hallstatt.png",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/1755_Lisbon_Earthquake_Location.png/640px-1755_Lisbon_Earthquake_Location.png",
    "",
  ];
  for (const url of bad) assert.equal(isPhotoUrl(url), false, url);
  const good = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Neuschwanstein_Castle_LOC_print.jpg/640px-Neuschwanstein_Castle_LOC_print.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Hiawatha_v45_scene1_4k_5mtopo.1760.tif/lossy-page1-960px-Hiawatha_v45_scene1_4k_5mtopo.1760.tif.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Elephant_seal_at_the_beach.jpg/640px-Elephant_seal_at_the_beach.jpg",
    "https://volcano.si.edu/gallery/photos/GVP-01047.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Mapungubwe_hill.jpg/640px-Mapungubwe_hill.jpg",
  ];
  for (const url of good) assert.equal(isPhotoUrl(url), true, url);
});

test("satellite URL is centred on the point and sized like a card image", () => {
  const url = satelliteUrl(48.8584, 2.2945, 15, 640, 360);
  assert.ok(url.startsWith("https://server.arcgisonline.com/"), url);
  const bbox = /bbox=([-\d.,]+)/.exec(url)?.[1]?.split(",").map(Number);
  assert.ok(bbox && bbox.length === 4 && bbox.every(Number.isFinite), "bbox has four numbers");
  const [x0, y0, x1, y1] = bbox as [number, number, number, number];
  assert.ok(x1 > x0 && y1 > y0, "bbox is well ordered");
  const centre = inverseMercator((x0 + x1) / 2, (y0 + y1) / 2);
  assert.ok(Math.abs(centre.lat - 48.8584) < 1e-4 && Math.abs(centre.lng - 2.2945) < 1e-4, "centre maps back to the pin");
  assert.ok(Math.abs((x1 - x0) / (y1 - y0) - 640 / 360) < 1e-3, "aspect ratio matches the requested size");
  assert.ok(url.includes("size=640,360"));
  // Poles are clamped rather than producing infinities.
  assert.ok(!satelliteUrl(-90, 0, 12).includes("Infinity"));
});

test("every pin resolves to an image: photo when it has one, satellite otherwise", () => {
  const withPhoto = imageFor(pin({ imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Castle.jpg/320px-Castle.jpg" }));
  assert.equal(withPhoto.kind, "photo");
  assert.ok(withPhoto.url.includes("/640px-"), "photos are requested at card width");
  assert.equal(withPhoto.credit, "Wikimedia Commons");

  const withMap = imageFor(pin({ imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Site_map.svg/320px-Site_map.svg.png" }));
  assert.equal(withMap.kind, "satellite", "a map thumbnail is not a photo");

  const bare = imageFor(pin());
  assert.equal(bare.kind, "satellite");
  assert.ok(bare.url.length > 0 && bare.credit.length > 0);

  const forced = imageFor(pin({ imageUrl: "https://volcano.si.edu/gallery/photos/GVP-01047.jpg" }), { forceSatellite: true });
  assert.equal(forced.kind, "satellite");

  const thumb = imageFor(pin(), { width: 160, height: 100 });
  assert.ok(thumb.url.includes("size=160,100"));
});

test("satellite zoom: sites close, epicentres and lakes wide", () => {
  assert.ok(satelliteZoom(pin({ category: "site" })) >= 15);
  assert.ok(satelliteZoom(pin({ category: "earthquake" })) <= 10);
  assert.ok(satelliteZoom(pin({ category: "geography", title: "Lake Baikal" })) < satelliteZoom(pin({ category: "geography", title: "Angel Falls" })));
  assert.ok(satelliteZoom(pin({ category: "earthquake", live: true })) <= 11);
});

test("sizedImage rewrites Wikimedia thumbnail widths and FilePath widths", () => {
  assert.equal(
    sizedImage("https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/A.jpg/320px-A.jpg", 160),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/A.jpg/160px-A.jpg",
  );
  assert.equal(
    sizedImage("https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/B.tif/lossy-page1-960px-B.tif.jpg", 640),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/B.tif/lossy-page1-640px-B.tif.jpg",
  );
  assert.equal(sizedImage("https://commons.wikimedia.org/wiki/Special:FilePath/C.jpg?width=640", 160), "https://commons.wikimedia.org/wiki/Special:FilePath/C.jpg?width=160");
  assert.equal(sizedImage("https://volcano.si.edu/gallery/photos/GVP-01047.jpg", 160), "https://volcano.si.edu/gallery/photos/GVP-01047.jpg");
});
