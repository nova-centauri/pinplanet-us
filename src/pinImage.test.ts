import assert from "node:assert/strict";
import { test } from "node:test";
import { PinImageResolver, wikipediaPhotos, type ImageProbe } from "./pinImage";
import type { Pin } from "./types";

function pin(extra: Partial<Pin> = {}): Pin {
  return {
    id: "x",
    title: "Battle of Kursk",
    category: "battle",
    family: "human",
    lat: 51.7,
    lng: 36.2,
    fact: "f".repeat(60),
    storyUrl: "https://en.wikipedia.org/wiki/Battle_of_Kursk",
    storyLabel: "",
    source: "test",
    added: "2026-01-01",
    continent: "europe",
    imageUrl: "",
    credit: "",
    rank: 0.5,
    ...extra,
  };
}

/** A probe that loads everything except the URLs listed in `broken`. */
function probe(broken: string[] = []): ImageProbe & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ensure: async (url) => {
      calls.push(url);
      return broken.some((b) => url.includes(b)) ? null : `blob:${url}`;
    },
  };
}

const CACHED = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Soviet_T-34.jpg/960px-Soviet_T-34.jpg";
const LIVE = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Kursk_1943.jpg/960px-Kursk_1943.jpg";

test("the cached Wikipedia photo is the default", async () => {
  const lookups: string[] = [];
  const r = new PinImageResolver(probe(), async (ref) => {
    lookups.push(ref.title);
    return [LIVE];
  });
  const image = await r.resolve(pin({ imageUrl: CACHED }));
  assert.equal(image.kind, "photo");
  assert.equal(image.via, "cache");
  assert.equal(image.url, CACHED);
  assert.deepEqual(lookups, [], "no API call when the cached photo loads");
});

test("no cached photo, or a broken one → a live Wikipedia lookup, before any satellite", async () => {
  const lookup = async () => [LIVE];
  const bare = await new PinImageResolver(probe(), lookup).resolve(pin());
  assert.equal(bare.via, "wikipedia");
  assert.equal(bare.url, LIVE);

  const broken = await new PinImageResolver(probe(["Soviet_T-34"]), lookup).resolve(pin({ imageUrl: CACHED }));
  assert.equal(broken.via, "wikipedia", "a cached photo that 404s falls through to Wikipedia");

  const mapOnly = await new PinImageResolver(probe(), async () => [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Kursk_map.jpg/960px-Kursk_map.jpg",
  ]).resolve(pin());
  assert.equal(mapOnly.kind, "satellite", "maps from the lookup are still not photos");
});

test("satellite is the backup: only when Wikipedia has nothing that loads", async () => {
  const none = await new PinImageResolver(probe(), async () => []).resolve(pin());
  assert.equal(none.kind, "satellite");
  assert.equal(none.via, "satellite");

  const failing = await new PinImageResolver(probe(), async () => {
    throw new Error("HTTP 429");
  }).resolve(pin());
  assert.equal(failing.kind, "satellite", "a lookup error never leaves the card blank");

  const noArticle = await new PinImageResolver(probe(), async () => [LIVE]).resolve(
    pin({ storyUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd" }),
  );
  assert.equal(noArticle.kind, "satellite", "pins without a Wikipedia article go straight to satellite");
});

test("a stored non-standard width is repaired, never requested", async () => {
  const p = probe(["/960px-"]);
  const stored = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Academy.jpg/640px-Academy.jpg";
  const image = await new PinImageResolver(p, async () => []).resolve(pin({ imageUrl: stored }));
  assert.equal(image.url, stored.replace("640px-", "500px-"));
  assert.ok(!p.calls.some((u) => u.includes("/640px-")), "640 px is a Wikimedia 400");
});

test("prefetch and landing share one resolution", async () => {
  let lookups = 0;
  const r = new PinImageResolver(probe(), async () => {
    lookups += 1;
    return [LIVE];
  });
  const p = pin();
  assert.equal(r.peek(p), undefined);
  r.prefetch(p);
  const image = await r.resolve(p);
  assert.equal(lookups, 1);
  assert.equal(r.peek(p)?.url, image.url, "peek returns the prefetched picture synchronously");
  r.invalidate(p);
  assert.equal(r.peek(p), undefined);
});

test("wikipediaPhotos: lead image first; the rest of the article only when the lead is not a photo", async () => {
  const urls: string[] = [];
  const photo = await wikipediaPhotos({ lang: "en", title: "Minaret of Jam" }, 960, async <T>(url: string) => {
    urls.push(url);
    return { query: { pages: [{ title: "Minaret of Jam", thumbnail: { source: LIVE } }] } } as T;
  });
  assert.deepEqual(photo, [LIVE]);
  assert.equal(urls.length, 1);
  assert.ok(urls[0]!.startsWith("https://en.wikipedia.org/w/api.php?"));
  assert.ok(urls[0]!.includes("origin=*") || urls[0]!.includes("origin=%2A"), "anonymous CORS");
  assert.ok(urls[0]!.includes("pithumbsize=960"));

  const photos = await wikipediaPhotos({ lang: "en", title: "Battle of Kursk (test)" }, 960, async <T>(url: string) => {
    if (url.includes("prop=pageimages")) {
      return { query: { pages: [{ title: "Battle of Kursk", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Kursk_map.png/960px-Kursk_map.png" } }] } } as T;
    }
    const file = (name: string, mime: string, width: number, height: number) => ({
      title: `File:${name}`,
      imageinfo: [{ thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/960px-${name}`, mime, width, height }],
    });
    return {
      query: {
        pages: [
          file("Flag_of_the_Soviet_Union.svg", "image/svg+xml", 1200, 600),
          file("Eastern_Front_map.jpg", "image/jpeg", 2000, 1500),
          file("Tiny.jpg", "image/jpeg", 200, 150),
          file("Tiger_tank_Kursk.jpg", "image/jpeg", 2400, 1600),
        ],
      },
    } as T;
  });
  assert.deepEqual(photos, ["https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tiger_tank_Kursk.jpg/960px-Tiger_tank_Kursk.jpg"]);

  const missing = await wikipediaPhotos({ lang: "en", title: "No such page (test)" }, 960, async <T>() => ({ query: { pages: [{ title: "x", missing: true }] } }) as T);
  assert.deepEqual(missing, []);
});
