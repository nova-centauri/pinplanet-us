# PinPlanet — dynamic pins

How the app adds pins on its own while running. The goal: the globe never
goes stale, and every fresh pin still passes the tight-location rule.

**Status (V1.1):** the provider architecture is built (`src/providers/`),
four providers are live, and the pool/expiry/localStorage layer is in place.
The trending-topics provider and its review queue are still open.

## Architecture: pin providers

Each source is a **provider**: a small module with one job —

```
fetch() -> Pin[]      # pins in the schema from 02-pin-schema.md
cadenceMs             # how often to poll while the page is open
staleMs               # how long a stored result may be reused on load
```

Startup order: bundled seeds render immediately → `public/data/pins.json`
(the build-time cache, see `06-data-sources.md`) merges in one fetch →
each provider first replays its last result from `localStorage`, then polls on
its own cadence. Pins carry their own `expires`; the pool sweeps every minute.

### Provider 1 — USGS earthquakes (`earthquake`, live) ✅

- **Source:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson`
  — no key, CORS enabled, updated every minute.
- **Pin shape:** title `M6.2 · 40 km SW of Ōita, Japan`, fact = magnitude,
  depth, how long ago, tsunami advisory / felt reports / alert level, plus a
  one-line "what a magnitude N quake means". Link = the USGS event page.
- **TTL:** 7 days. **Cadence:** 15 min. Top 80 by magnitude.
- **Breaking:** a fresh M6+ (< 6 h old, not yet shown) may cut in line once.

### Provider 2 — NASA EONET natural events (`volcano` / `natural disaster`, live) ✅

- **Source:** `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=45`
  — open events: erupting volcanoes, wildfires, severe storms, floods, sea
  ice, icebergs. Public domain, CORS enabled.
- **Pin shape:** latest geometry point of the event; fact = type, when it was
  reported, size (acres / kts / km²) and the number of observations. Link =
  the first source URL (IRWIN, NHC, JTWC, GDACS…) or the EONET page.
- **TTL:** 3 days from the last observation. **Cadence:** hourly. Top 45 by
  type weight (volcanoes and storms first) and recency.

### Provider 3 — The ISS (`science`, live, moving) ✅

- **Source:** `https://api.wheretheiss.at/v1/satellites/25544` — CORS
  enabled, no key, position every 12 s while the tab is visible.
- **Pin shape:** one pin, id `iss-live`, that moves across the globe; fact =
  altitude, speed, daylight/eclipse. When the tour lands on it, the marker
  keeps following the station.

### Provider 4 — Wikipedia "on this day" (`historical`) ✅

- **Build time:** all 366 days are already in the cache, two events per day,
  tagged `day: "MM-DD"`. Today's get a 6× tour weight and a *TODAY IN
  HISTORY* badge — no fetch needed.
- **Runtime:** `feed/onthisday/events/MM/DD` for the current date adds up to
  eight more events (TTL: midnight). Same tightness classifier
  (`src/otd.ts`) at build and at runtime.

### Provider 5 — Random towns (`random place`) — partially covered

- The plan called for GeoNames + Wikipedia. Instead, the cache carries ~200
  ghost towns, remote outposts and silly-name towns from Wikidata and a
  hand-picked list. A "town of the day" from GeoNames is still open.

### Provider 6 — Trending topics (`current topic`) — open

- Needs the hackathon trending feed's actual response shape. The tightness
  filter it needs already exists (`isTightDescription`), so the remaining
  work is geocoding + the review queue.

## Pool rules (apply to every provider)

1. **Dedupe:** the build merges same-article pins and same-category pins within
   20 km; at runtime the pool is keyed by id, and live pins refresh in place.
2. **Freshness:** expired pins leave the pool silently. Seeds and cached pins
   never expire.
3. **Choreography:** the tour never jumps twice in a row to the same continent
   (hard rule) and interleaves categories: airtime per category ∝ √(size), the
   previous category is down-weighted 8×, recent pins (last 60) are skipped.
4. **Breaking pins:** a fresh major earthquake may interrupt the tour once with
   a "Breaking" toast — disasters are the only category allowed to cut in line.
5. **Offline:** if the cache fetch and every provider fail, the app tours on
   the 29 seeds and says nothing beyond a console line. The globe never looks
   broken.

## What to build next (priority order)

1. Trending + tightness filter — the differentiator; needs the feed shape.
2. GeoNames "town of the day".
3. GDACS (floods/cyclones with alert levels) if EONET proves too quiet.
4. Smithsonian weekly volcanic activity report through a tiny proxy (GVP has
   no CORS) for richer "erupting now" text.
