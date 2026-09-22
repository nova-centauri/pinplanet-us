# PinPlanet — planning

**PinPlanet** (pinplanet.us) is a single-browser-window "global fact jumper":
a spinning 3D globe that auto-tours the planet, swooping from pin to pin.
Each pin pops a card with one killer fact (or a recent story) and a link that
opens the full story in a new tab. Part screensaver, part rabbit hole.

## Docs in here

| File | What it is |
|---|---|
| `01-concept.md` | The concept, the core loop, and what makes it sing |
| `02-pin-schema.md` | The pin data contract, category definitions, the image rule |
| `03-seed-pins.md` | Hand-curated starter pins (the quality bar) |
| `04-dynamic-pins.md` | How the app adds pins on its own while running |
| `05-roadmap.md` | What's done (V1, V1.1, V1.2) and what's next |
| `06-data-sources.md` | Every data source, how facts are composed, licenses, how to rebuild the cache |
| `07-themes-and-visuals.md` | The ten themes, the visual system, images on every card, the history panel, keys |

## Source of truth

- Hand-curated seed pins: `../data/seed-pins.json` (bundled into the app),
  mirrored for humans in `03-seed-pins.md` — keep them in sync when editing.
- Generated pool: `../public/data/pins.json` + `pins.meta.json`, produced by
  `npm run cache:build` (`../scripts/cache/`). Don't hand-edit; fix the
  builder and regenerate.
- Live feeds: `../src/providers/`.
- Plans evolve here; code lives at the repo root.
