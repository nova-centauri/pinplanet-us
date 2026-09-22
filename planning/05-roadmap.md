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

## V1.2 — a picture on every pin, history, a bigger pool — done

- [x] Every card has an image: photo from the cache (maps/flags/logos
      rejected, Wikidata P18 fallback, seeds included) or a satellite view of
      the spot at runtime (Esri, optional Google key); prefetched during the
      flight so it is on screen when the card opens
- [x] *Visited* panel (`H`), `←` / `→` back and forward, persisted 30 days;
      manual hops ignore the auto-tour continent rule; flights scale with
      distance
- [x] Pool grown: built structures (castles, lighthouses, bridges, dams,
      towers, statues, temples…), islands, national parks, reefs, beaches,
      valleys, forests, ultra-prominent peaks, historic natural disasters,
      radio telescopes and reactors; three on-this-day events per day; more
      fossil dig sites; lower sitelink bars outside Europe / North America
- [x] Continent-balanced tour weighting; category-aware proximity merge
- [x] Tests: image classifier, satellite URL, history model, continent lift,
      cache image contract

## Next

- [ ] Trending feed + review queue (`current topic`) — needs the hackathon
      skill's response shape
- [ ] GeoNames "town of the day"
- [ ] Sound: subtle whoosh on jump, ambient pad (mutable, off by default)
- [ ] Mobile polish: bottom-sheet card, larger tap targets
- [ ] Deploy to pinplanet.us and set the two webhook secrets
- [ ] Monthly `npm run cache:build` (GitHub Action on a schedule → PR)
- [ ] Sitemap / share links (`?pin=<id>` deep links)
- [ ] Share links (`?pin=<id>`) that open on a pin — the history panel is
      the natural place to copy one from
- [ ] An LLM rewrite pass in the builder so generated facts read like the
      seeds (punchy, one surprise each), attribution kept

## Cut list (if time gets short)

Cut in this order: sound → trending filter (keep the review queue) → GeoNames
towns. Never cut: the jump animation, the seed pins, the fact-card writing
quality, the cached pool.
