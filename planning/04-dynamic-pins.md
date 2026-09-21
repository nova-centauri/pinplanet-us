# PinPlanet — dynamic pins

How the app adds pins on its own while running. The goal: the globe never
goes stale, and every fresh pin still passes the tight-location rule.

## Architecture: pin providers

Each source is a **provider**: a small module with one job —

```
fetch() -> list[Pin]      # returns pins in the schema from 02-pin-schema.md
ttl                       # how long its pins stay in the pool
```

The app loads `data/seed-pins.json` at startup (these never expire), then
polls each provider on its own cadence and merges results into one pin pool.
`localStorage` caches the pool so repeat visits feel instant.

### Provider 1 — USGS earthquakes (`natural disaster`)

- **Source:** USGS Earthquake API, no key needed:
  `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5`
- **Why it works:** every quake arrives with a tight epicenter, magnitude,
  depth, and timestamp. Zero curation needed.
- **Pin shape:** title = `"M6.2 earthquake — 40 km off the coast of …"`,
  fact = magnitude + depth + nearest named place, link = the USGS event page.
- **TTL:** 7 days. **Cadence:** every 15 minutes.

### Provider 2 — Random towns (`random place`)

- **Source:** GeoNames API (free tier): random populated place with
  `population < 10,000`.
- **Story:** hit the Wikipedia API with the town name; take the first two
  sentences of the summary as the "why it exists" story. Fallback fact
  template: *"A town of N people in {region}, founded {year}."*
  (year comes from the Wikipedia text when available, else omitted).
- **Cadence:** one new town per day, kept as "today's random town". Old ones
  retire after 7 days so the pool keeps breathing.
- **Tight-location note:** towns are the *one* category exempt from the
  tight-location rule — the town itself is the point.

### Provider 3 — Trending topics (`current topic`)

- **Source:** the hackathon's "last 30 days" trending skill (whatever feed it
  returns: topics + links + timestamps).
- **Pipeline:**
  1. Extract every location mentioned in each trending item.
  2. Geocode each candidate.
  3. **Tightness filter** (the star of the show):
     - ✅ keep: venue / landmark / address / coordinates
       ("the Catacombs of Paris" → keep)
     - ❌ drop: city / state / country / metro ("Paris" → drop)
     - gray zone (neighborhood/region): keep **iff** it has a Wikipedia
       article with coordinates, else drop
  4. Survivors become `current topic` pins; the trending story is the link.
- **TTL:** 30 days (matches the feed window). **Cadence:** hourly.
- **Review queue:** dropped-but-interesting items land in a small on-page
  queue Steve can glance at and rescue by hand — one click promotes a
  rejected item to a curated pin.

### Provider 4 — Wikipedia "on this day" (`historical`, optional stretch)

- The Wikipedia On-This-Day API returns historical events; cross-reference
  each with the Wikipedia geo API and keep only those with tight coordinates.
- Nice-to-have for week one; cut it if time gets tight.

## Pool rules (apply to every provider)

1. **Dedupe:** a new pin within ~25 km of an existing pin in the same
   category is merged, not added. Newest source wins the fact text.
2. **Freshness:** expired pins leave the pool silently. Seeds never expire.
3. **Choreography:** the tour engine never jumps twice in a row to the same
   continent and interleaves categories (no volcano-after-volcano).
4. **Breaking pins:** a fresh `natural disaster` pin may interrupt the tour
   once with a subtle pulse — disasters are the only category allowed to
   cut in line.
5. **Offline:** if all providers fail, the app tours on seeds alone and says
   nothing. The globe must never look broken.

## What to build first (priority order)

1. Seeds + tour engine (no providers) — the demo works on day one.
2. USGS provider — easiest, most reliable, most dramatic.
3. Random towns — the crowd-pleaser.
4. Trending + tightness filter — the differentiator; needs the hackathon
   skill's actual response shape before finalizing.
