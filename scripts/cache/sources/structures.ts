import type { BuildContext, CachedPin } from "../types";
import { classQuery, parseWdDate, qty, relax, sparql, type Row } from "../wikidata";
import { eraYear, fmtInt, fmtNum } from "../text";
import { firstSentenceMentions, num, pinsFromWikidata } from "./common";
import type { WikiSummary } from "../wikipedia";

/**
 * Things people built that you can stand in front of: castles, lighthouses,
 * bridges, dams, towers, statues, temples… Each class is capped so no one
 * kind floods the pool, and the hook leads with the number that makes the
 * place remarkable (height, length, the year it went up).
 */

interface StructureClass {
  qids: string[];
  label: string;
  noun: string;
  min: number; // sitelink bar in Europe / North America
  limit: number;
  cap: number;
  category?: string;
  /** Which measurement to lead with. */
  measure?: "height" | "length";
  /** Verb for the date: "built", "opened", "completed", "first lit". */
  verb?: string;
}

const STRUCTURES: StructureClass[] = [
  { qids: ["Q23413", "Q17715832"], label: "castles", noun: "Castle", min: 24, limit: 1000, cap: 100, verb: "built" },
  { qids: ["Q57821", "Q1785071"], label: "forts & fortifications", noun: "Fortress", min: 14, limit: 700, cap: 60, verb: "built" },
  { qids: ["Q16560"], label: "palaces", noun: "Palace", min: 30, limit: 600, cap: 50, verb: "built" },
  { qids: ["Q2977"], label: "cathedrals", noun: "Cathedral", min: 35, limit: 700, cap: 60, measure: "height", verb: "completed" },
  { qids: ["Q32815"], label: "mosques", noun: "Mosque", min: 22, limit: 600, cap: 50, verb: "built" },
  { qids: ["Q44539", "Q842402"], label: "temples", noun: "Temple", min: 22, limit: 700, cap: 70, verb: "built" },
  { qids: ["Q44613"], label: "monasteries", noun: "Monastery", min: 22, limit: 600, cap: 40, verb: "founded" },
  { qids: ["Q39715"], label: "lighthouses", noun: "Lighthouse", min: 9, limit: 600, cap: 60, measure: "height", verb: "first lit" },
  { qids: ["Q12280"], label: "bridges", noun: "Bridge", min: 22, limit: 800, cap: 70, measure: "length", verb: "opened" },
  { qids: ["Q12323"], label: "dams", noun: "Dam", min: 12, limit: 600, cap: 50, measure: "height", verb: "completed" },
  { qids: ["Q11303"], label: "skyscrapers", noun: "Skyscraper", min: 22, limit: 700, cap: 50, measure: "height", verb: "completed" },
  { qids: ["Q12518"], label: "towers", noun: "Tower", min: 25, limit: 600, cap: 40, measure: "height", verb: "completed" },
  { qids: ["Q179700"], label: "statues", noun: "Statue", min: 18, limit: 600, cap: 50, measure: "height", verb: "unveiled" },
  { qids: ["Q44377"], label: "tunnels", noun: "Tunnel", min: 12, limit: 400, cap: 30, measure: "length", verb: "opened" },
  { qids: ["Q474"], label: "aqueducts", noun: "Aqueduct", min: 8, limit: 250, cap: 25, measure: "length", verb: "built" },
  { qids: ["Q820477"], label: "mines", noun: "Mine", min: 10, limit: 500, cap: 40, verb: "opened" },
  { qids: ["Q40357"], label: "prisons", noun: "Prison", min: 18, limit: 400, cap: 30, verb: "opened" },
];

export async function buildStructures(ctx: BuildContext): Promise<CachedPin[]> {
  const out: CachedPin[] = [];
  for (const s of STRUCTURES) {
    const rows = await sparql(
      classQuery({
        classes: s.qids,
        minSitelinks: relax(s.min),
        limit: s.limit,
        select: "?built ?opened ?height ?length",
        optional: `OPTIONAL { ?item wdt:P571 ?built . } OPTIONAL { ?item wdt:P1619 ?opened . } ${qty("P2048", "?height")} ${qty("P2043", "?length")}`,
      }),
      s.label,
    );
    const pins = await pinsFromWikidata({
      ctx,
      rows,
      category: s.category ?? "site",
      idPrefix: "built",
      cap: s.cap,
      minSitelinks: s.min,
      hook: (row, summary) => structureHook(s, row, summary),
      year: (row) => parseWdDate(row.built ?? row.opened)?.year,
      bonus: (row) => {
        const h = num(row.height) ?? 0;
        const l = num(row.length) ?? 0;
        return h >= 300 || l >= 3000 ? 0.12 : h >= 100 || l >= 1000 ? 0.05 : 0;
      },
    });
    out.push(...pins);
  }
  return out;
}

function structureHook(s: StructureClass, row: Row, summary: WikiSummary): string | null {
  const bits: string[] = [];
  const height = num(row.height);
  const length = num(row.length);
  if (s.measure === "height" && height && height > 0 && !firstSentenceMentions(summary, fmtInt(height))) bits.push(`${fmtInt(height)} m tall`);
  if (s.measure === "length" && length && length > 0 && !firstSentenceMentions(summary, length >= 1000 ? fmtNum(length / 1000) : fmtInt(length)))
    bits.push(length >= 1000 ? `${fmtNum(length / 1000)} km long` : `${fmtInt(length)} m long`);
  const when = parseWdDate(row.opened ?? row.built) ?? parseWdDate(row.built);
  if (when && when.year > -4000 && when.year <= 2026 && !firstSentenceMentions(summary, Math.abs(when.year))) {
    bits.push(`${s.verb ?? "built"} ${eraYear(when.year)}`);
  }
  if (!bits.length) return null;
  return `${s.noun}, ${bits.join(", ")}.`;
}
