import { fetchJson } from "../http";
import { CREDIT, type BuildContext, type CachedPin } from "../types";
import { candidatesForDay, otdFact, pickCandidates, type OtdEvent } from "../../../src/otd";
import { slugify } from "../text";
import { dedupeById, round } from "./common";

/**
 * Wikipedia "On this day" for all 366 days → "moments in time" pins, each
 * tagged with its MM-DD so the app can light up today's history. The feed
 * skews to modern disasters; `pickCandidates` (shared with the runtime
 * provider) rebalances toward older and happier moments.
 */

const PER_DAY = 2;
const GRIM_PER_DAY = 1;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export async function buildOnThisDay(ctx: BuildContext): Promise<CachedPin[]> {
  const pins: CachedPin[] = [];
  let days = 0;
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= DAYS_IN_MONTH[month - 1]!; day++) {
      if (ctx.limit && days >= Math.max(3, ctx.limit / 4)) break;
      days += 1;
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
      let data: { events: OtdEvent[] };
      try {
        data = await fetchJson<{ events: OtdEvent[] }>(url, { maxAgeMs: 90 * 86_400_000 });
      } catch (err) {
        process.stderr.write(`  otd ${mm}-${dd}: ${(err as Error).message.slice(0, 100)}\n`);
        continue;
      }
      const cands = candidatesForDay(data.events ?? []).filter(
        (c) => c.text.length >= 40 && c.text.length <= 300 && !/\bis (born|elected)\b/i.test(c.text),
      );
      for (const c of pickCandidates(cands, PER_DAY, GRIM_PER_DAY)) {
        pins.push({
          id: `otd-${mm}${dd}-${slugify(`${c.year}-${c.title}`)}`,
          title: c.title,
          category: "historical",
          lat: round(c.lat),
          lng: round(c.lng),
          fact: otdFact(c.year, c.text),
          story_url: c.url,
          story_label: `Wikipedia: ${c.title}`,
          source: "wikipedia-otd",
          added: ctx.today,
          continent: ctx.continentOf(c.lat, c.lng),
          credit: CREDIT.wikipedia,
          rank: round(Math.min(1, 0.45 + c.score * 0.08), 3),
          year: c.year,
          day: `${mm}-${dd}`,
          ...(c.image ? { image_url: c.image } : {}),
        });
      }
      if (days % 60 === 0) process.stderr.write(`  otd: ${days} days, ${pins.length} pins so far\n`);
    }
  }
  return dedupeById(pins);
}
