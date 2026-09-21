# PinPlanet — data sources

How the pin pool went from 29 hand-written seeds to 3,296 cached pins plus
live feeds, without giving up the quality bar in `03-seed-pins.md`.

Two layers:

1. **Cached pins** — generated at build time by `scripts/cache/`, committed to
   `public/data/pins.json`, loaded by the browser in one request. No API calls
   on the critical path: the globe is touring the full pool ~200 ms after paint.
2. **Live pins** — a handful of feeds polled in the browser (earthquakes, NASA
   natural events, the ISS, today's history). Cached in `localStorage` so a
   reload is instant and a dead network degrades to "slightly stale", never to
   "broken".

## The cached pool at a glance

| | |
|---|---|
| Total pins | **3,296** (target was ≥ 1,000): 1,400 in the core file the browser loads first, 1,896 in the extension loaded after the first landing |
| With a thumbnail | 3,109 (94 %) |
| File size | 939 KB core + 1,276 KB extension, raw (≈ 204 KB + 277 KB gzipped), one pin per line |
| Continents | all seven |
| Build time | ≈ 10 min cold, seconds warm (every HTTP response is cached in `scripts/.cache/`) |

Per category:

| Category | Pins |
|---|---|
| `geography` | 610 |
| `historical` | 483 |
| `battle` | 271 |
| `ancient` | 262 |
| `fossil` | 236 |
| `site` | 227 |
| `volcano` | 219 |
| `random place` | 210 |
| `impact` | 192 |
| `science` | 176 |
| `earthquake` | 166 |
| `shipwreck` | 150 |
| `world record` | 94 |

Per source:

| Source | Pins |
|---|---|
| Wikidata + Wikipedia (bulk queries) | 1458 |
| Wikipedia (hand-picked titles) | 1168 |
| Wikipedia "On this day" | 334 |
| Smithsonian Global Volcanism Program | 219 |
| Paleobiology Database | 117 |

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
  capped at 280 so volcanoes don't flood the pool.
- **License:** free with citation — *Global Volcanism Program, Smithsonian
  Institution*. Credited on every card.
- **CORS:** none — that's why this is build-time only. Live eruption activity
  comes from NASA EONET instead.

### Wikidata + Wikipedia → `battle`, `impact`, `earthquake`, `shipwreck`, `science`, `ancient`, `geography`, `site`, `random place`, `fossil`

One SPARQL query per class (with `wikibase:sitelinks` as the fame proxy and a
required English article), then one batched Wikipedia action-API call per 20
titles for the intro text, short description, thumbnail and coordinates.

| Builder | Wikidata classes | Structured hook |
|---|---|---|
| battles | battle, siege, naval battle | `Fought 18 June 1815.` |
| craters | impact crater | `Impact crater, 180 km across.` |
| meteorites | meteorite | `Meteorite, 60 tonnes.` |
| quakes | earthquake (with magnitude) | `Magnitude 9.5 on 22 May 1960; 1,655 dead.` |
| shipwrecks | shipwreck | `Lost 15 April 1912.` |
| science | spaceport, observatory, Antarctic research station, particle accelerator, nuclear accident | — |
| ancient | archaeological site, ancient city, pyramid, megalith, stone circle, amphitheatre | — |
| peaks | mountains ≥ 6,000 m + the highest point of every country | `Highest point of Nepal: 8,848 m above sea level.` |
| features | waterfall, cave, ice cave, lake, desert, canyon, glacier, geyser, hot spring, doline, cenote, blue hole, fjord, atoll, dune, rock formation | `Waterfall, 979 m tall.` etc. |
| heritage | UNESCO World Heritage Site ID | `UNESCO World Heritage Site since 1983.` |
| ghost towns | ghost town | — (towns are exempt from the tight-location rule) |
| fossil sites | lagerstätte, paleontological site | — |

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
- **License:** Wikidata CC0; Wikipedia text CC BY-SA 4.0 — credited on the
  card as *Text: Wikipedia · CC BY-SA 4.0*.

### Paleobiology Database → `fossil`

- **What:** occurrence records for ~150 famous extinct genera (Tyrannosaurus,
  Archaeopteryx, Megalodon, Mammoth, Neanderthal, Dickinsonia…), i.e. where the
  bones actually came out of the ground. Occurrences are grouped by
  country/state; the busiest localities become pins (two for the top 45
  genera, one for the rest).
- **Fact shape:** `Tyrannosaurus fossils were dug up in Montana, the United
  States — late Maastrichtian, about 68 million years ago (41 recorded finds).`
  + the genus's Wikipedia first sentence.
- **License:** CC BY 4.0 — credited as *Paleobiology Database*.

### Wikipedia "On this day" → `historical` (moments in time)

- **What:** all 366 days of `feed/onthisday/events`, filtered to events whose
  page is a tight location (the classifier above), at most two per day with a
  spread of eras and topics. Each pin carries `day: "MM-DD"`.
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
2. **Proximity merge** — same-category pins within 20 km collapse to one.
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
rule rejected, and writes `public/data/pins.meta.json` alongside the pool.
Commit both files. Rebuild monthly-ish: the only things that go stale are the
"erupting" flags and newly notable articles.

Wikimedia rate-limits parallel requests from one IP, so the HTTP layer
serialises every Wikimedia call with a 350 ms gap and backs off on 429/5xx;
don't run two builds at once.

## Attribution shown in the product

- Card credit line: *Text: Wikipedia · CC BY-SA 4.0* / *Smithsonian Global
  Volcanism Program* / *Paleobiology Database · CC BY 4.0* / *USGS* / *NASA
  EONET* / *Where the ISS at?*.
- Land outlines: Natural Earth (public domain) via `world-atlas`; continent
  polygons for the build also from Natural Earth.
