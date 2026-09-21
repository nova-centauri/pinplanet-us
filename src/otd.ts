/**
 * Wikipedia "On this day" → pin candidates.
 *
 * Shared by the build-time cache (all 366 days) and the runtime provider
 * (today's feed). The tight-location rule lives here: a page only qualifies
 * as a pin location when it is a thing — a battle, a bridge, a crater —
 * never a city, state or country.
 */

export interface OtdPage {
  title: string;
  normalizedtitle?: string;
  displaytitle?: string;
  description?: string;
  type?: string;
  coordinates?: { lat: number; lon: number; globe?: string };
  thumbnail?: { source: string; width?: number; height?: number };
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

export interface OtdEvent {
  year: number;
  text: string;
  pages: OtdPage[];
}

export interface OtdCandidate {
  year: number;
  text: string;
  title: string;
  url: string;
  lat: number;
  lng: number;
  image: string | null;
  description: string;
  score: number;
}

const REJECT_FIRST =
  /\b(island (nation|country|state)|city[- ]state|sovereign state|nation state|country in|capital (city|of)|constituent country)\b/i;

const ACCEPT =
  /\b(battle|siege|earthquake|eruption|volcano|volcanic|desert|waterfall|canyon|glacier|geyser|spring|sinkhole|cenote|fjord|atoll|dune|cliff|gorge|valley|caldera|island\b|disaster|attack|massacre|bombing|shooting|crash|collision|accident|derailment|fire|flood|tsunami|cyclone|hurricane|typhoon|tornado|avalanche|landslide|shipwreck|sinking|wreck|assassination|riot|uprising|revolt|rebellion|treaty|summit|expedition|launch|landing|explosion|collapse|monument|memorial|museum|stadium|arena|bridge|tunnel|dam|tower|building|skyscraper|palace|castle|fort|fortress|cathedral|church|temple|mosque|synagogue|abbey|monastery|airport|station|hospital|prison|camp|cemetery|park|square|plaza|street|theatre|theater|hall|library|observatory|laboratory|plant|mine|canal|lighthouse|spaceport|cosmodrome|racetrack|circuit|venue|site|ruins|cave|crater|falls|glacier|peak|summit|mount\b|mountain\b|volcano|reef|lake|bay\b|harbor|harbour|pier|shipyard|factory|refinery|reactor|facility|base\b|barracks|garrison|embassy|consulate|school|university campus|hotel|casino|mall|market|nightclub|club\b|pub\b|restaurant|festival|race\b|marathon|match|final\b|olympic|games\b|ceremony|coronation|wedding|funeral|concert|premiere|exhibition|fair\b|world's fair|exposition|protest|strike|march\b|demonstration|referendum|election|inauguration|independence|founding|opening|dedication|unveiling|discovery|excavation|find\b|meteorite|impact|test\b|detonation|trial\b|execution|escape|heist|robbery|raid\b|ambush|skirmish|campaign|offensive|invasion|blockade|evacuation|airlift|rescue|flight\b|voyage|crossing|ascent|first ascent|record|feat)\b/i;

const REJECT =
  /\b(country|city|town|village|capital|state|province|county|district|region|municipality|kingdom|republic|empire|continent|nation|territory|commonwealth|federation|legislature|congress|parliament|senate|assembly|company|airline|corporation|enterprise|political party|organization|organisation|association|federation|union|league|university|college|academy|institute|school district|newspaper|magazine|band|album|film|novel|song|television|tv series|series|sports team|football club|basketball team|baseball team|hockey team|club|championship|tournament|competition|human settlement|borough|prefecture|department|canton|oblast|emirate|sultanate|principality|duchy|dynasty|ethnic group|language|religion|denomination|body of water|sea\b|ocean|gulf|strait|river|mountain range|peninsula|archipelago|planet|moon\b|star\b|galaxy|constellation|comet|asteroid|spacecraft|space probe|satellite|rocket|aircraft|ship class|automobile|car model|weapon|firearm|missile|software|video game|operating system|website|protocol|currency|holiday|award|prize|title|rank|position|office|post|job|profession|family|clan|tribe|surname|given name|name|concept|theory|law\b|act\b|bill\b|statute|treaty organization|military unit|regiment|division|army|navy|air force|police|agency|ministry|court|government|administration|cabinet|monarchy|papacy|pope|bishopric|diocese|archdiocese|see\b|province of|state of|county of|district of|region of|municipality of|island in|islands in|island of|island group)\b/i;

/**
 * The tight-location rule applied to a Wikipedia short description:
 * a thing (battle, bridge, crater, cave) passes; a city, state, country,
 * river or organisation does not. Empty descriptions pass.
 */
export function isTightDescription(description: string | undefined | null): boolean {
  const desc = (description ?? "").trim();
  if (!desc) return true;
  if (REJECT_FIRST.test(desc)) return false;
  if (ACCEPT.test(desc)) return true;
  if (REJECT.test(desc)) return false;
  return true;
}

/** Does this page count as a tight location? */
export function isTightPage(page: OtdPage): boolean {
  if (!page.coordinates) return false;
  if (page.coordinates.globe && page.coordinates.globe.toLowerCase() !== "earth") return false;
  if (page.type && page.type !== "standard") return false;
  if (/^\d{1,4}( BC| BCE| AD| CE)?$/.test(page.title.replace(/_/g, " "))) return false;
  return isTightDescription(page.description);
}

function titleWords(title: string): string[] {
  return title
    .replace(/_/g, " ")
    .replace(/\(.*?\)/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

const STOP = new Set([
  "battle",
  "siege",
  "the",
  "and",
  "of",
  "for",
  "with",
  "from",
  "into",
  "attack",
  "earthquake",
  "eruption",
  "incident",
  "disaster",
  "first",
  "second",
  "third",
  "united",
  "states",
  "kingdom",
  "national",
  "world",
  "war",
  "great",
]);

/** Score how well a page anchors an event; higher is better, ≤ 0 = unusable. */
export function scorePage(page: OtdPage, eventText: string): number {
  if (!isTightPage(page)) return 0;
  let score = 1;
  if (page.thumbnail?.source) score += 1;
  const lower = eventText.toLowerCase();
  const words = titleWords(page.title);
  const hits = words.filter((w) => lower.includes(w)).length;
  if (words.length > 0) score += (2 * hits) / words.length;
  const desc = page.description ?? "";
  if (ACCEPT.test(desc)) score += 0.5;
  return score;
}

export function formatYear(year: number): string {
  if (year < 0) return `${-year} BCE`;
  if (year < 1000) return `${year} CE`;
  return String(year);
}

/**
 * Turn a day's events into pin candidates. Returns at most one candidate
 * per event (its best-scoring tight page), sorted best-first.
 */
export function candidatesForDay(events: OtdEvent[]): OtdCandidate[] {
  const out: OtdCandidate[] = [];
  for (const event of events) {
    if (!event || typeof event.year !== "number" || !event.text) continue;
    const text = event.text.replace(/\s+/g, " ").trim();
    if (text.length < 24) continue;
    let best: OtdPage | null = null;
    let bestScore = 0;
    for (const page of event.pages ?? []) {
      const s = scorePage(page, text);
      if (s > bestScore) {
        best = page;
        bestScore = s;
      }
    }
    if (!best || !best.coordinates) continue;
    const title = (best.normalizedtitle ?? best.title).replace(/_/g, " ");
    const url =
      best.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(best.title.replace(/ /g, "_"))}`;
    out.push({
      year: event.year,
      text,
      title,
      url,
      lat: best.coordinates.lat,
      lng: best.coordinates.lon,
      image: cleanThumb(best.thumbnail?.source),
      description: best.description ?? "",
      score: bestScore,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const GRIM =
  /\b(crash|crashes|crashed|killed|killing|kills|dead|death|deaths|die|dies|died|massacre|bomb|bombing|bombed|attack|attacks|attacked|shoot|shooting|shot|murder|murdered|terror|terrorist|suicide|hijack|hijacked|explode|explodes|explosion|sinks|sinking|sunk|collapse|collapses|derail|derails|stampede|drown|drowned|assassinat\w*|execut\w*|genocide|lynch\w*|riot|riots)\b/i;
const AVIATION = /\b(flight \d|airlines? flight|airways flight|air \w+ flight|plane crash|air crash|airliner|aircraft|helicopter)\b/i;
const UPBEAT =
  /\b(opens|opened|opening|founded|founds|established|establishes|discover\w*|first|launch\w*|lands|landing|landed|inaugurat\w*|complet\w*|record|treaty|independen\w*|coronation|crowned|premiere|unveil\w*|dedicat\w*|begins|wins|won|elected|signed|announce\w*|ceremony|celebrat\w*|reaches|summit|ascent|expedition|voyage|sets sail|departs|arrives|observ\w*|photograph\w*|broadcast\w*|debut\w*|patent\w*|invent\w*|found\b|foundation|cornerstone|consecrat\w*|proclaim\w*)\b/i;

const BATTLE = /\b(battle|siege|defeats?|defeated|army|armies|troops|forces|invasion|invades?|captures?|surrenders?|war\b)\b/i;

export function isGrim(text: string): boolean {
  return GRIM.test(text);
}

/**
 * How much a candidate deserves the globe's attention. The raw feed is two
 * thirds disasters and 96 % twentieth-century; this pulls the mix toward
 * older, stranger and happier moments without banning the rest.
 */
export function tourScore(c: OtdCandidate): number {
  let s = c.score;
  if (c.year < 1500) s += 1.4;
  else if (c.year < 1800) s += 1.1;
  else if (c.year < 1900) s += 0.7;
  else if (c.year < 1950) s += 0.3;
  if (UPBEAT.test(c.text)) s += 0.5;
  if (isGrim(c.text)) s *= 0.3;
  if (AVIATION.test(c.text)) s *= 0.4;
  if (BATTLE.test(c.text)) s *= 0.55; // the pool already has a whole category of battles
  if (c.text.length < 45) s *= 0.7;
  return s;
}

/**
 * Choose up to `max` candidates for a day: best tourScore first, at most
 * `maxGrim` disasters, no two of the same topic.
 */
export function pickCandidates(cands: OtdCandidate[], max: number, maxGrim: number): OtdCandidate[] {
  const ranked = [...cands].sort((a, b) => tourScore(b) - tourScore(a));
  const out: OtdCandidate[] = [];
  let grim = 0;
  for (const c of ranked) {
    if (out.length >= max) break;
    const g = isGrim(c.text);
    if (g && grim >= maxGrim) continue;
    if (out.some((o) => o.url === c.url || sameTopic(o.text, c.text))) continue;
    out.push(c);
    if (g) grim += 1;
  }
  return out;
}

const TOPIC = /(earthquake|eruption|battle|siege|crash|bomb|attack|massacre|treaty|independence|election|coronation|launch|landing|flood|fire|hurricane|typhoon|shooting|assassin|sink|wreck|opens|founded)/i;

function sameTopic(a: string, b: string): boolean {
  const ta = TOPIC.exec(a)?.[1]?.toLowerCase();
  const tb = TOPIC.exec(b)?.[1]?.toLowerCase();
  return Boolean(ta && tb && ta === tb);
}

/** Strip tracking params and normalise the thumbnail host. */
export function cleanThumb(src: string | undefined | null): string | null {
  if (!src) return null;
  let url = src.split("?")[0]!;
  url = url.replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/");
  return url;
}

/** Compose the fact line for an on-this-day pin. */
export function otdFact(year: number, text: string, max = 280): string {
  const head = `${formatYear(year)} — `;
  let body = text;
  if (head.length + body.length > max) {
    const room = max - head.length - 1;
    const cut = body.slice(0, room);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
    body = (stop > room * 0.5 ? cut.slice(0, stop) : cut.trimEnd()) + "…";
  }
  return head + body;
}

export function todayKey(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}-${d}`;
}
