# PinPlanet — themes & the visual system

## Themes (press `T`)

Ten palettes. `T` cycles forward, `Shift+T` back, the *Theme* button does the
same for touch. The choice persists in `localStorage`. A toast names the
theme and its one-line mood.

| id | name | mood |
|---|---|---|
| `tokyo-night` | Tokyo Night | the original: indigo dusk, neon coastlines |
| `ember` | Ember | volcanic: black basalt, glowing lava lines |
| `arctic` | Arctic | ice-white land on a near-black sea |
| `phosphor` | Phosphor | green terminal glass, 1983 |
| `synthwave` | Synthwave | magenta horizon, chrome and cyan |
| `blueprint` | Blueprint | drafting-table cyanotype, white ink |
| `aurora` | Aurora | polar night, green curtains, violet edge |
| `noir` | Noir | monochrome, one red thread |
| `parchment` | Parchment (light) | an old atlas: sepia ink on cream |
| `daylight` | Daylight (light) | clean paper-white, ink-blue continents |

One object per theme (`src/themes.ts`) drives both halves of the UI:

- **HUD** — `applyThemeCss()` writes CSS custom properties (`--bg`, `--fg`,
  `--accent`, `--pin-nature`, …) on `<html>`; every stylesheet colour is a
  variable, so the switch is a 400 ms cross-fade with no re-layout.
- **Globe** — `GlobeScene.applyTheme()` updates shader uniforms (land / coast /
  ice colours, body rim, atmosphere, star alpha, the three pin-family colours,
  the active marker) and the flight rig's trail colours. Nothing is rebuilt.
- **Light themes** switch glow materials from additive to normal blending
  (additive light on a light background is invisible), hide the stars, and
  lower the day/night contrast.

Adding a theme = one entry in `THEMES`. Keep `pinNature` / `pinHuman` /
`pinLive` distinguishable from each other and from `land`; the legend in the
dock is generated from the same variables.

## Visual system (V1.1 pass)

**Pins as one draw call.** 2,000+ pins are a single `THREE.Points` with a
custom shader: per-pin size (fame), family colour (nature / history / live),
a slow twinkle, a stronger pulse for live pins, and back-face fade so pins
behind the horizon dim before the body sphere occludes them. The V1 approach
(six meshes per pin) would have been ~14,000 draw calls.

**One active marker.** Halo, two pulse rings, the beam and the bloom sprite
exist once and move to whichever pin is current, tinted with the theme's
`active` colour.

**Leader line.** An SVG overlay draws a dashed quadratic curve from the active
pin's projected screen position to the nearest edge of the card, with a ring
at the pin. It hides when the pin rotates behind the globe or sits under the
card.

**Day and night.** The land shader takes the real sub-solar point
(`src/sun.ts`, from UTC time + solar declination) and dims dots on the night
side. Contrast is a theme value (`sun`); light themes use less.

**Land sampler fix.** Rings that cross the antimeridian (Fiji) used to sweep a
one-pixel sliver across the raster, which showed up as a stray row of dots
across the Pacific at 16°S. Rings are now unwrapped and drawn at three
longitude offsets.

**Card.** Category pill coloured by family; badges for *LIVE*, *TODAY IN
HISTORY*, *ERUPTING*, *SATELLITE VIEW* and the year; continent + coordinates;
the story link; a credit line for the text source and, in the corner of the
picture, the imagery credit.

**A picture on every card (V1.2).** Photos come from the cache at 640 px; a
pin without one — and every live pin — gets a satellite view of the spot
(`src/imagery.ts`; Esri World Imagery, or Google Static Maps with a key).
A photo that fails to load falls back to the satellite view too. The next
pin's image is fetched into a blob while the camera is still flying
(`src/imageLoader.ts`), so the picture is on screen the moment the card opens.

**History (V1.2).** Every landing is logged (`src/history.ts`, persisted in
`localStorage` for 30 days). `H` or the *History* button opens the *Visited*
panel: thumbnails, title, category, continent and "4 min ago", newest first,
the current pin highlighted. Click a row to fly back; `←` / `→` (or
Backspace) walk the log without adding to it. Revisits and globe clicks are
the user's choice, so they ignore the auto-tour's continent rule, and the
card lingers at least 14 s before the tour moves on.

**Flights scale with distance.** A hop across the planet takes the full
4 s and climbs high; a revisit next door is quicker and flatter, so backing
up one pin never loops into space.

**Continent balance.** The tour lifts pins on thin continents
(`continentLift` in `src/tour.ts`, capped at 2.5×) so a pool that is a third
Europe does not become a tour that is a third Europe.

**Status bar.** Mode LED, continent hop, dwell countdown, pin count with the
number of live pins, and the current theme name.

**Dwell time** scales with the fact length (5.5–12 s) so short facts move on
and long ones can be read.

## Keys & controls

| Key | Action |
|---|---|
| `space` | jump now |
| `←` / `→` (or Backspace) | back / forward through the pins you've seen |
| `H` | open / close the *Visited* panel |
| `Esc` | close the panel |
| `T` / `Shift+T` | next / previous theme |
| `P` | pause / resume the auto-tour |
| drag | orbit while idle |
| click a pin | fly there (any continent — the continent rule only governs the auto-tour) |

## Performance budget

Draw calls per frame ≈ 12 (body, meridians, land, pins, two atmosphere
shells, two star layers, active marker parts, trail core + glow). The land
cloud is 20,000 points; the pin cloud rebuilds in < 2 ms when the pool
changes. Bundle: ~70 KB app + ~495 KB three.js (cached separately) + the pin files:
939 KB core (204 KB gzipped) now, 1,276 KB extension (277 KB gzipped) after the first landing.
