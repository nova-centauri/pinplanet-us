# PinPlanet — data sources

How the pin pool went from 29 hand-written seeds to 5,763 cached pins plus
live feeds, without giving up the quality bar in `03-seed-pins.md`.

Two layers:

1. **Cached pins** — generated at build time by `scripts/cache/`, committed to
   `public/data/pins.json` (+ `pins-extra.json`), loaded by the browser in two
   requests. No API calls on the critical path: the globe is touring a
   1,400-pin core ~200 ms after paint and the full pool after the first
   landing.
2. **Live pins** — a handful of feeds polled in the browser (earthquakes, NASA
   natural events, the ISS, today's history). Cached in `localStorage` so a
   reload is instant and a dead network degrades to "slightly stale", never to
   "broken".

## The cached pool at a glance (V1.2)

| | |
|---|---|
| Total pins | **5,763** (V1.1: 3,296; the original target was ≥ 1,000): 1,400 in the core file the browser loads first, 4,363 in the extension loaded after the first landing |
| With a photo | 5,396 (94 %); the other 367 get a satellite view in the app, so every card has a picture |
| File size | 944 KB core + 2,940 KB extension, raw (≈ 206 KB + 637 KB gzipped), one pin per line |
| Moments in time | 846 pins carry a `day` tag (661 from the on-this-day feed, the rest inherited) |
| Continents | all seven — Europe 1,902 · Asia 1,530 · North America 1,098 · Africa 461 · South America 348 · Oceania 339 · Antarctica 85 |
| Build time | ≈ 20 min cold, seconds warm (every HTTP response is cached in `scripts/.cache/`) |

Per category:

| Category | Pins |
|---|---|
| `geography` | 1,209 |
| `site` | 917 |
| `historical` | 853 |
| `battle` | 424 |
| `volcano` | 363 |
| `ancient` | 324 |
| `impact` | 265 |
| `random place` | 261 |
| `fossil` | 252 |
| `earthquake` | 251 |
| `science` | 237 |
| `shipwreck` | 202 |
| `natural disaster` | 110 |
| `world record` | 95 |

Per source:

| Source | Pins |
|---|---|
| Wikidata + Wikipedia (bulk queries) | 3,300 |
| Wikipedia (hand-picked titles) | 1,309 |
| Wikipedia "On this day" | 661 |
| Smithsonian Global Volcanism Program | 363 |
| Paleobiology Database | 130 |

## Sources

### Smithsonian Global Volcanism Program → `volcano`

- **What:** every Holocene volcano on Earth (~1,200) from the GVP WFS service,
  with the GVP geological summary, the primary photo, elevation, type, last
  eruption year, and the "continuing eruption" list (`E3WebApp_Eruptions1960`).
- **Wikipedia link:** matched through Wikidata's *Global Volcanism Program ID*
  (P1886); falls back to the GVP page when no article exists.
- **Fact shape:** `Stratovolcano, 3,776 m in Japan. Last erupted 1707.` + the
  first sentence(s) of the GVP summary. Volcanoes in the continuing-eruption
  list get an `erupting` flag (shown as a badge) and `Erupting as of <month>`.
- **Selection:** ranked by Wikipedia fame + recent activity + having a photo;
  capped at 420 so volcanoes don't flood the pool.
- **License:** free with citation — *Global Volcanism Program, Smithsonian
  Institution*. Credited on every card.
- **CORS:** none — that's why this is build-time only. Live eruption activity
  comes from NASA EONET instead.

### Wikidata + Wikipedia → `battle`, `impact`, `earthquake`, `natural disaster`, `shipwreck`, `science`, `ancient`, `geography`, `site`, `random place`, `fossil`

One SPARQL query per class (with `wikibase:sitelinks` as the fame proxy and a
required English article), then one batched Wikipedia action-API call per 20
titles for the intro text, short description, thumbnail and coordinates.

| Builder | Wikidata classes | Structured hook |
|---|---|---|
| battles | battle, siege, naval battle | `Fought 18 June 1815.` |
| craters | impact crater | `Impact crater, 180 km across.` |
| meteorites | meteorite | `Meteorite, 60 tonnes.` |
| quakes | earthquake (with magnitude) | `Magnitude 9.5 on 22 May 1960; 1,655 dead.` |
| disasters (V1.2) | tsunami, volcanic eruption, flood, avalanche, landslide, wildfire, tornado | `Tsunami, 26 December 2004; 227,898 dead.` |
| shipwrecks | shipwreck | `Lost 15 April 1912.` |
| science | spaceport, observatory, Antarctic research station, particle accelerator, nuclear accident, radio telescope, nuclear power plant | — |
| ancient | archaeological site, ancient city, pyramid, megalith, stone circle, amphitheatre | — |
| peaks | mountains ≥ 6,000 m, ultra-prominent peaks (≥ 1,800 m of prominence), the highest point of every country | `Highest point of Nepal: 8,848 m above sea level.` |
| features | waterfall, cave, ice cave, lake, desert, canyon, glacier, geyser, hot spring, doline, cenote, blue hole, fjord, atoll, dune, rock formation, + V1.2: island, national park, reef, spring, beach, valley, forest | `Waterfall, 979 m tall.` / `National park since 1872, 8,983 km².` |
| heritage | UNESCO World Heritage Site ID | `UNESCO World Heritage Site since 1983.` |
| structures (V1.2) | castle, castle ruin, fortification, fort, palace, cathedral, mosque, temple, Hindu temple, monastery, lighthouse, bridge, dam, skyscraper, tower, statue, tunnel, aqueduct, mine, prison | `Lighthouse, 55 m tall, first lit 1611.` / `Bridge, 1.3 km long, opened 1937.` |
| ghost towns | ghost town | — (towns are exempt from the tight-location rule) |
| fossil sites | lagerstätte, paleontological site | — |

Each class states the sitelink bar it wants for Europe and North America; the
query runs at half that bar and `pinsFromWikidata` applies a lower bar on
the other continents (`CONTINENT_FACTOR`: Asia 0.85, Oceania 0.6, Africa and
South America 0.5, Antarctica 0.3), so the pool reaches past the places
Wikipedia writes most about.

Rules applied to every Wikidata pin:

- **Earth only** — coordinates must carry `geoGlobe = Earth`, which is what
  keeps lunar craters like Tycho off the globe.
- **Tight-location rule** — the Wikipedia short description is run through the
  same classifier the on-this-day feed uses (`src/otd.ts`): cities, countries,
  states, rivers, organisations are rejected; battles, bridges, craters, caves
  pass. This is what threw out Venice and Brasília from the UNESCO list.
- **Hook only when it adds information** — if the article's first sentence
  already states the year/height/magnitude, the hook is dropped rather than
  repeated.
- **Cleaning** — pronunciation parentheticals, transliterations, citation
  brackets and the unbalanced "(" the API leaves behind are stripped
  (`scripts/cache/text.ts`, unit-tested).
- **A photo, not a map (V1.2)** — Wikipedia's lead image is kept only when
  `isPhotoUrl()` (`src/imagery.ts`) says it is a photograph: locator maps,
  flags, logos, shakemaps, diagrams and SVG renders are refused. The fallback
  is the item's Wikidata image (P18), rewritten to a direct Commons
  thumbnail. Pins that still have no photo are demoted under the source's cap
  and get a satellite view in the app.
- **License:** Wikidata CC0; Wikipedia text CC BY-SA 4.0 — credited on the
  card as *Text: Wikipedia · CC BY-SA 4.0*.

### Paleobiology Database → `fossil`

- **What:** occurrence records for ~150 famous extinct genera (Tyrannosaurus,
  Archaeopteryx, Megalodon, Mammoth, Neanderthal, Dickinsonia…), i.e. where the
  bones actually came out of the ground. Occurrences are grouped by
  country/state; the busiest localities become pins (three for the top 25
  genera, two for the next 65, one for the rest). Genera whose article leads
  with a size-comparison chart take their Wikidata photo instead.
- **Fact shape:** `Tyrannosaurus fossils were dug up in Montana, the United
  States — late Maastrichtian, about 68 million years ago (41 recorded finds).`
  + the genus's Wikipedia first sentence.
- **License:** CC BY 4.0 — credited as *Paleobiology Database*.

### Wikipedia "On this day" → `historical` (moments in time)

- **What:** all 366 days of `feed/onthisday/events`, filtered to events whose
  page is a tight location (the classifier above), at most three per day with
  a spread of eras and topics. Each pin carries `day: "MM-DD"`.
- **Fact shape:** `1999 — The 7.7-magnitude Chi-Chi earthquake strikes central
  Taiwan, killing 2,400 people.`
- **Runtime twist:** pins whose `day` is today get a 6× tour weight and a
  *TODAY IN HISTORY* badge, so the globe tells today's stories without any
  fetch. The live `today` provider adds a few more for the current date.

### Hand-picked titles (`scripts/cache/sources/curated.ts`) → `world record`, `geography`, `science`, `historical`, `fossil`, `ancient`, `site`, `random place`, `shipwreck`

About 1,300 Wikipedia titles chosen by hand: the extremes (deepest cave,
hottest place, tallest tree), the postcard landmarks, nuclear test sites and
spaceports, memorials at the exact spot history happened, famous fossil digs,
and the silly-name towns (Hell, Michigan; Å; Nowhere Else) that the *random
place* category exists for. Text, coordinates and images come from the
article; titles without coordinates are skipped and logged.

## Live providers (browser)

| Provider | Feed | Cadence | Pin TTL | Category |
|---|---|---|---|---|
| USGS | `earthquake.usgs.gov …/4.5_week.geojson` | 15 min | 7 days | `earthquake` (live) |
| NASA EONET | `eonet.gsfc.nasa.gov/api/v3/events?status=open` | 60 min | 3 days | `volcano` / `natural disaster` (live) |
| Where the ISS at? | `api.wheretheiss.at/v1/satellites/25544` | 12 s | — | `science` (live, the pin moves) |
| Wikipedia today | `feed/onthisday/events/MM/DD` | 6 h | until midnight | `historical` |

All four are public domain / free, key-less and CORS-enabled. A magnitude-6+
quake less than six hours old may cut in line once ("Breaking" toast), which is
the only category allowed to interrupt the tour (`04-dynamic-pins.md`, rule 4).

## Pool rules (implemented in `scripts/cache/build.ts` and `src/pins.ts`)

1. **One pin per article** — sources are merged in priority order (curated →
   volcanoes → battles → … → on-this-day); a later duplicate donates its
   `day` tag to the winner so "today in history" still lights up.
2. **Proximity merge** — same-category pins closer than a category-specific
   radius collapse to one: 20 km for craters, quakes and disasters (one event
   under two names), 3–8 km for volcanoes, fossils, battles and natural
   features, 400–600 m for sites, ancient sites and moments in time (a city
   holds a dozen distinct landmarks within a kilometre).
3. **Seeds win** — anything sharing a seed's article is dropped from the cache.
4. **Schema validation** — the build fails if any fact exceeds 280 characters,
   any coordinate is off-planet, or any id repeats. `npm test` re-checks the
   committed file.
5. **Expiry** — live pins carry `expires`; the pool sweeps them every minute.

## Running the build

```bash
npm run cache:build                    # full rebuild (network required)
npm run cache:build -- --only=volcanoes,battles
npm run cache:build -- --limit=20      # dev: a few rows per source → pins.dev.json
npm run cache:build -- --fresh         # ignore scripts/.cache and refetch everything
```

The build prints per-source counts, how many candidates the tight-location
rule and the continent bar rejected, where each source's photos came from,
and writes `public/data/pins.meta.json` alongside the pool.
Commit both files. Rebuild monthly-ish: the only things that go stale are the
"erupting" flags and newly notable articles.

Wikimedia rate-limits parallel requests from one IP, so the HTTP layer
serialises every Wikimedia call with a 350 ms gap and backs off on 429/5xx;
don't run two builds at once.

## Attribution shown in the product

- Card credit line: *Text: Wikipedia · CC BY-SA 4.0* / *Smithsonian Global
  Volcanism Program* / *Paleobiology Database · CC BY 4.0* / *USGS* / *NASA
  EONET* / *Where the ISS at?*.
- Card image corner: *Photo · Wikimedia Commons* / *Photo · Smithsonian GVP*
  / *Satellite · Esri, Maxar, Earthstar Geographics* (or *Google* when built
  with a Static Maps key).
- Land outlines: Natural Earth (public domain) via `world-atlas`; continent
  polygons for the build also from Natural Earth.

## Satellite imagery (V1.2)

Pins without a photo — and every live pin — show a satellite view of the
spot. The default is the Esri World Imagery *export* endpoint
(`server.arcgisonline.com/…/World_Imagery/MapServer/export`), which returns
one centred 640×360 JPEG for a Web Mercator bounding box, needs no key, and
sends CORS headers so the app can prefetch it. Esri asks for attribution
(*Esri, Maxar, Earthstar Geographics*), which the card shows. To use Google
instead, build with `VITE_GOOGLE_MAPS_KEY=<a referrer-restricted Static Maps
key>`; the URL builder in `src/imagery.ts` switches automatically. The key
is public in the bundle by design (restrict it to the site's origin).
