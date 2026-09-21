# PinPlanet — planning

**PinPlanet** (pinplanet.us) is a single-browser-window "global fact jumper":
a spinning 3D globe that auto-tours the planet, swooping from pin to pin.
Each pin pops a card with one killer fact (or a recent story) and a link that
opens the full story in a new tab. Part screensaver, part rabbit hole.

## Docs in here

| File | What it is |
|---|---|
| `01-concept.md` | The concept, the core loop, and what makes it sing |
| `02-pin-schema.md` | The pin data contract + category definitions |
| `03-seed-pins.md` | Hand-curated starter pins (the quality bar) |
| `04-dynamic-pins.md` | How the app adds pins on its own while running |
| `05-roadmap.md` | The one-week build plan |

## Source of truth

- Machine-readable seed pins live in `../data/seed-pins.json` and follow the
  schema in `02-pin-schema.md`. The markdown list in `03-seed-pins.md` is the
  human-friendly mirror — keep them in sync when editing.
- Plans evolve here; code lives at the repo root.
