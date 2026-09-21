# PinPlanet — pin schema

Every pin, curated or dynamic, follows this contract so both streams render
identically.

```jsonc
{
  "id": "darvaza-gas-crater",          // slug, unique, stable
  "title": "The Door to Hell",         // display name
  "category": "site",                 // one of the categories below
  "lat": 40.2525,
  "lng": 58.4394,
  // "zoom": 5,                      // optional: camera closeness override
  "fact": "A natural-gas crater in Turkmenistan that's been burning since 1971, when Soviet engineers set it alight expecting it to burn out in weeks.",
  "story_url": "https://en.wikipedia.org/wiki/Darvaza_gas_crater",
  "story_label": "Wikipedia: Darvaza gas crater",  // where the link goes
  // "image_url": "…",               // optional: card thumbnail
  "source": "curated",                // "curated" | provider name e.g. "usgs"
  "added": "2026-09-21",              // ISO date the pin entered the pool
  // "expires": "2026-10-21",        // optional: dynamic pins can expire
}
```

## Field rules

- `fact`: one fact, ≤ 280 characters, surprising/visual/funny. Never a
  paragraph. Never two facts joined by "also".
- `story_url`: must resolve to something real. Wikipedia preferred for
  timeless facts; a news source for current topics and disasters.
- `lat`/`lng`: the *tight* location — the thing itself, not its city.
- `id`: lowercase slug; dynamic providers namespace theirs
  (e.g. `usgs-2026-09-21-m6.2-offshore`).

## Categories

| Category | What belongs here | Example |
|---|---|---|
| `site` | A specific place you could visit | Darvaza gas crater |
| `geography` | Natural features & formations | Mariana Trench |
| `event` | Scheduled happenings with a venue | Up Helly Aa fire festival |
| `historical` | Something that happened *here* | Pompeii |
| `current topic` | Trending now, tight location | (dynamic feed) |
| `random fact` | The wild card — weird human stories | Monowi, pop. 1 |
| `random place` | The random-towns routine | Coober Pedy |
| `natural disaster` | Live alerts with tight epicenters | (USGS feed) |
| `world record` | Biggest / tallest / deepest / oldest | Angel Falls |

## The tight-location rule

A pin's coordinates must be the thing itself:

- ✅ Accept: named venue, landmark, street address, coordinates —
  "the Catacombs of Paris", "Balloon Fiesta Park".
- ❌ Reject: anything resolving to city / state / country / metro level —
  "Paris" is out.
- Gray zone (neighborhoods, regions): accept **iff** it has a Wikipedia
  article with coordinates; otherwise reject.

This rule applies to curated pins *and* to everything the dynamic providers
produce. See `04-dynamic-pins.md` for how the filter is implemented.
