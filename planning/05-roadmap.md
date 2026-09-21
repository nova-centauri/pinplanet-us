# PinPlanet — roadmap

## Week one (V1) — done

- [x] Name locked: PinPlanet, pinplanet.us
- [x] Repo + planning docs + 29 seed pins
- [x] Globe prototype: point-cloud land, atmosphere glow, slow rotation
- [x] Pin markers on the globe (glowing dots + pulse)
- [x] Camera fly-to animation between pins (the money moment)
- [x] Fact card UI: title, fact, read-more link (new tab)
- [x] Auto-tour engine: timed jumps, continent alternation
- [x] Drag-to-explore
- [x] "Surprise me" button
- [x] CI (test + build) and the VPS deploy webhook

## V1.1 — data, themes, visuals — done

- [x] **Cache builder** (`scripts/cache/`): Wikidata + Wikipedia, Smithsonian
      GVP volcanoes, Paleobiology Database fossils, Wikipedia on-this-day ×366,
      ~1,300 hand-picked titles → `public/data/pins.json` (3,296 pins)
- [x] Tight-location classifier shared by build and runtime
- [x] Live providers: USGS quakes, NASA EONET, ISS position, today-in-history
- [x] Pin pool merge + expiry + `localStorage` cache
- [x] Category interleave + √-weighting + today boost + breaking-quake cut-in
- [x] Ten themes, `T` to cycle, persisted
- [x] Visual pass: single-draw-call pin cloud, active marker, leader line,
      real day/night shading, badges, credits, legend, counters, dynamic dwell
- [x] Click a pin to fly there; `P` to pause
- [x] Tests: cache contract (≥ 1,000, schema), tightness filter, tour
      weighting, text cleaning
- [x] Docs: `06-data-sources.md`, `07-themes-and-visuals.md`

## Next

- [ ] Trending feed + review queue (`current topic`) — needs the hackathon
      skill's response shape
- [ ] GeoNames "town of the day"
- [ ] Sound: subtle whoosh on jump, ambient pad (mutable, off by default)
- [ ] Mobile polish: bottom-sheet card, larger tap targets
- [ ] Deploy to pinplanet.us and set the two webhook secrets
- [ ] Monthly `npm run cache:build` (GitHub Action on a schedule → PR)
- [ ] Sitemap / share links (`?pin=<id>` deep links)
- [ ] Optional: same-continent hops on click (relax the V1 rule for manual
      picks only)

## Cut list (if time gets short)

Cut in this order: sound → trending filter (keep the review queue) → GeoNames
towns. Never cut: the jump animation, the seed pins, the fact-card writing
quality, the cached pool.
