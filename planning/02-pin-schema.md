# PinPlanet — pin schema

Every pin, curated, cached or live, follows this contract so all streams
render identically.

```jsonc
{
  "id": "darvaza-gas-crater",          // slug, unique, stable
  "title": "The Door to Hell",         // display name
  "category": "site",                 // one of the categories below
  "lat": 40.2525,
  "lng": 58.4394,
  "fact": "A natural-gas crater in Turkmenistan that's been burning since 1971, when Soviet engineers set it alight expecting it to burn out in weeks.",
  "story_url": "https://en.wikipedia.org/wiki/Darvaza_gas_crater",
  "story_label": "Wikipedia: Darvaza gas crater",  // where the link goes
  "source": "curated",                // "curated" | "wikidata" | "wikipedia" | "wikipedia-otd" | "gvp" | "pbdb" | live provider id
  "added": "2026-09-21",              // ISO date the pin entered the pool
  // ── added in V1.1 (all optional) ──
  "continent": "asia",                // precomputed at build time (Natural Earth polygons)
  "image_url": "https://upload.wikimedia.org/…/640px-….jpg",  // card thumbnail, cached
  "year": 1971,                       // the moment in time; negative = BCE
  "day": "09-21",                     // MM-DD for on-this-day pins → "TODAY IN HISTORY"
  "credit": "Wikipedia · CC BY-SA 4.0", // text attribution shown on the card
  "rank": 0.82,                       // 0..1 fame proxy (Wikipedia sitelinks); drives size + tour weight
  "flags": ["erupting"],              // badges
  // "expires": 1790000000000,        // live pins only (epoch ms)
}
```

## Field rules

- `fact`: one fact, ≤ 280 characters, surprising/visual/funny. Never a
  paragraph. Never two facts joined by "also". Generated facts lead with a
  structured hook (`Magnitude 9.5 on 22 May 1960; 1,655 dead.`) followed by
  whole sentences from the source — never a mid-sentence cut without an
  ellipsis.
- `story_url`: must resolve to something real. Wikipedia preferred for
  timeless facts; USGS / NASA / GVP pages for live and specialist data.
- `lat`/`lng`: the *tight* location — the thing itself, not its city.
- `id`: lowercase slug; generated pins are namespaced by source
  (`gvp-283030`, `battle-battle-of-waterloo`, `otd-0921-1999-jiji-earthquake`,
  `usgs-us7000tj0z`).
- `continent`: one of `africa · antarctica · asia · europe · north-america ·
  oceania · south-america`. The app guesses it from coordinates when absent.

## Categories

| Category | Family | What belongs here | Example |
|---|---|---|---|
| `site` | history | A specific place you could visit; UNESCO sites; landmarks | Darvaza gas crater, Eiffel Tower |
| `geography` | nature | Natural features & formations | Mariana Trench, Angel Falls |
| `world record` | nature | Biggest / tallest / deepest / oldest | Burj Khalifa, Veryovkina Cave |
| `volcano` | nature | Holocene volcanoes (GVP) | Mount Fuji |
| `earthquake` | nature / live | Historic quakes with a magnitude; live USGS quakes | 1960 Valdivia; M5.2 off Tonga |
| `impact` | nature | Impact craters and meteorites | Chicxulub, Hoba |
| `fossil` | nature | Where fossils came out of the ground; lagerstätten | Tyrannosaurus · Montana, Burgess Shale |
| `battle` | history | Battlefields and sieges with a date | Waterloo |
| `historical` | history | Moments in time at the exact spot; on-this-day events | Pompeii, Trinity site |
| `ancient` | history | Archaeological sites, ancient cities, megaliths | Göbekli Tepe |
| `shipwreck` | history | Charted wrecks | Titanic |
| `science` | history / live | Observatories, spaceports, colliders, polar stations, nuclear sites; the ISS | Baikonur, ISS |
| `event` | history | Scheduled happenings with a venue | Up Helly Aa |
| `random fact` | history | The wild card — weird human stories | Monowi, pop. 1 |
| `random place` | history | Ghost towns, remote outposts, silly-name towns | Pripyat, Hell (Michigan) |
| `natural disaster` | live | Open NASA EONET events: wildfires, storms, floods | (live feed) |
| `current topic` | live | Trending now, tight location | (not yet implemented) |

*Family* is the colour on the globe and the card accent: **nature** (cyan in
Tokyo Night), **history** (violet), **live** (orange, pulsing). The legend in
the dock is generated from the theme.

## The tight-location rule

A pin's coordinates must be the thing itself:

- ✅ Accept: named venue, landmark, street address, coordinates —
  "the Catacombs of Paris", "Balloon Fiesta Park".
- ❌ Reject: anything resolving to city / state / country / metro level —
  "Paris" is out.
- Gray zone (neighborhoods, regions): accept **iff** it has a Wikipedia
  article with coordinates; otherwise reject.
- Exception: `random place` — the town *is* the point.

This rule applies to curated pins *and* to everything the build and the
dynamic providers produce. The implementation is `isTightDescription()` in
`src/otd.ts`: a Wikipedia short description is accepted when it names a thing
(battle, bridge, crater, cave, falls, station…) and rejected when it names a
polity or an organisation. The same function filters the on-this-day feed at
build time and at runtime, and every bulk Wikidata pin. Hand-picked titles
and towns bypass it.
