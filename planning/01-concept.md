# PinPlanet — concept

## The one-sentence pitch

A globe that jumps around the planet on its own, landing on pins that each
tell you one amazing thing — then jumps again.

## The core loop

1. The globe turns slowly in a dark, starry window. Ambient, beautiful.
2. Every ~8 seconds it **swoops** to a glowing pin — the camera arcs across
   the planet with a light trail. This is the money moment.
3. A card slides in: the pin's name, one killer fact (≤ 280 chars), and a
   *read the full story* link that opens in a new tab.
4. The globe resumes turning… then jumps again.

## Modes

- **Auto-tour** (default): the app just goes. This is the demo mode and the
  screensaver mode.
- **Drag to explore**: grab the globe, spin it, click any pin yourself.
- **Surprise me**: a button for the impatient — jumps immediately.

## The pin system

Everything on the globe is a **pin**: a tight location + a category + one
fact + one link. Categories:

`site` · `geography` · `event` · `historical` · `current topic` ·
`random fact` · `random place` · `natural disaster` · `world record`

See `02-pin-schema.md` for the data contract.

## Where pins come from

Two streams, one globe:

1. **Curated seeds** (`data/seed-pins.json`) — ~30 hand-picked pins that set
   the quality bar. These never expire.
2. **Dynamic providers** (see `04-dynamic-pins.md`) — while the app runs it
   fetches fresh pins: earthquakes from USGS, a daily random small town,
   trending topics filtered to tight locations, etc.

## What makes it sing

- **The jump is the show.** Never hard-cut between pins; always fly.
- **The writing carries it.** Ten amazing facts beat fifty boring ones.
  Every fact must be surprising, visual, or funny — ideally all three.
- **Choreography matters.** The auto-tour never lands twice in a row on the
  same continent, and it interleaves categories so a volcano isn't followed
  by another volcano. (A pin you pick yourself — a click, a history row — can
  be anywhere; the rule shapes the tour, not the user.)
- **Every pin links somewhere real.** Wikipedia for facts, news sources for
  current topics. No dead ends.
