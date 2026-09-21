# PinPlanet

A single-window 3D globe that auto-tours the planet, swooping from pin to pin.
Each landing pops a fact card. This repo's app is a **V1 animation prototype**
— the jump is the show; live data providers, themes, sound, and deploy are out
of scope.

Planning notes still live in `planning/`. Curated seed pins live in
`data/seed-pins.json`.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually [http://localhost:5173](http://localhost:5173)).

```bash
npm run build      # typecheck + production bundle
npm run preview    # serve the built files
```

## What V1 does

- Full-viewport **point-cloud globe** (Tokyo Night palette, no textured Earth)
- Auto-tour on by default: camera **arcs** between pins with a glow trail — never a hard cut
- **Continent rule:** every hop lands on a different continent than the last pin
- Dwell ~5s so the info card can be read (title, fact, date, still image)
- Drag to orbit while idle · **Surprise me** / `space` jumps immediately

Pins are the 29 curated seeds, tagged with a continent in the app layer.
Images use public `picsum.photos` placeholders and fall back to a solid panel
if they fail to load. There is no audio.
