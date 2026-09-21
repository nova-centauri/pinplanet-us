# PinPlanet

A single-window 3D globe that auto-tours the planet, swooping from pin to pin.
Each landing pops a fact card. **V1.1** adds a 3,296-pin cached pool built
from open data (volcanoes, battlefields, fossils, craters, meteorites,
shipwrecks, ancient sites, world records, 334 moments in time…), four live
feeds (earthquakes, NASA natural events, the ISS, today in history), ten
colour themes and a visual pass.

Planning notes live in `planning/` — start with `planning/README.md`.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually [http://localhost:5173](http://localhost:5173)).

```bash
npm test             # tour rules, tightness filter, text cleaning, cache contract
npm run build        # typecheck + production bundle
npm run preview      # serve the built files
npm run cache:build  # regenerate public/data/pins.json from the open-data sources (~10 min)
```

CI (detect → install/test/build) runs on every push and PR. A green push to
`main` notifies VPS-01 via a signed GitHub-shaped webhook at
`https://pinplanet.us/hooks/pinplanet-deploy` once `DEPLOY_WEBHOOK_URL` and
`DEPLOY_WEBHOOK_SECRET` are set. Missing secrets warn and skip; they do not
fail the run.

## What it does

- Full-viewport **point-cloud globe** with real day/night shading, atmosphere
  glow, two star layers
- Auto-tour on by default: cinematic camera hop (ease, altitude, slight roll)
  + additive trail, then a dwell that scales with the fact length
- **Continent rule:** every hop lands on a different continent than the last
  pin; categories are interleaved so a volcano is rarely followed by a volcano
- **3,296 cached pins** in two static files (a 1,400-pin core, then the rest after the first landing), so the tour is running the full
  pool ~200 ms after first paint — no API on the critical path
- **Live layer:** USGS quakes (15 min), NASA EONET events (hourly), the ISS
  (moves every 12 s), today's history; cached in `localStorage`, expires on
  its own, never blocks
- **Ten themes** — `T` cycles, `Shift+T` goes back, the choice is remembered
- Card: thumbnail (cached), category pill, LIVE / TODAY IN HISTORY / ERUPTING /
  year badges, coordinates, story link, text credit; a leader line ties the
  card to the pin
- Drag to orbit · click a pin · `space` jumps now · `P` pauses

## Keys

| Key | Action |
|---|---|
| `space` | jump now |
| `T` / `Shift+T` | next / previous theme |
| `P` | pause / resume |

## Data & attribution

Full detail in `planning/06-data-sources.md`. In short:

- **Wikidata** (CC0) selects the things; **Wikipedia** (CC BY-SA 4.0) supplies
  intro text, thumbnails and the "on this day" events — credited on every card
- **Smithsonian Global Volcanism Program** — volcano data and photos, cited
  as *Global Volcanism Program, Smithsonian Institution*
- **Paleobiology Database** (CC BY 4.0) — fossil occurrences
- **USGS**, **NASA EONET**, **Where the ISS at?** — live feeds, public domain
- **Natural Earth** (public domain) — coastlines and continent polygons

## Layout

```
data/seed-pins.json        29 hand-curated seeds (bundled)
public/data/pins.json      generated core pool (1,400 pins) · pins-extra.json (1,896 more) · pins.meta.json
scripts/cache/             the builder: http layer, wikidata/wikipedia helpers, one file per source
src/                       app: globe, flight, themes, tour, providers, HUD
planning/                  concept, schema, sources, roadmap
```
