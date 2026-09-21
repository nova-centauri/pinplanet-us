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

- Full-viewport **point-cloud globe** (Tokyo Night palette, coast-lit dots, atmosphere glow)
- Auto-tour on by default: cinematic camera hop (ease, altitude, slight roll) + additive trail
- **Continent rule:** every hop lands on a different continent than the last pin
- Dwell ~6s so the info card can be read (title, fact, date, Wikipedia still when available)
- Idle slow spin + pin pulse — meant to sit open like a screensaver
- Drag to orbit while idle · **Surprise me** / `space` jumps immediately

Pins are the 29 curated seeds, tagged with a continent in the app layer.
Card images try the Wikipedia page thumbnail and fall back to a coordinate panel.
There is no audio.
