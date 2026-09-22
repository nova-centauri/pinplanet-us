import { createHash } from "node:crypto";
import { isPhotoUrl } from "../../src/imagery";
import { fetchJson } from "./http";
import { articleTitle, sparql } from "./wikidata";
import { cleanThumb } from "../../src/otd";

export interface WikiSummary {
  title: string; // canonical title (after redirects)
  url: string;
  extract: string;
  description: string;
  image: string | null;
  lat: number | null;
  lng: number | null;
  missing: boolean;
}

interface ActionPage {
  title: string;
  missing?: boolean;
  extract?: string;
  terms?: { description?: string[] };
  thumbnail?: { source: string };
  coordinates?: { lat: number; lon: number; globe?: string; primary?: boolean }[];
  pageprops?: { disambiguation?: string };
}

interface ActionResponse {
  batchcomplete?: boolean;
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: ActionPage[];
  };
}

const BATCH = 20;
const memo = new Map<string, WikiSummary>();

/**
 * Fetch intro extract + short description + thumbnail + coordinates for many
 * titles, 20 per request, via the MediaWiki action API. Results are keyed by
 * the title you asked for (normalisation/redirects are followed for you).
 */
export async function summaries(titles: string[]): Promise<Map<string, WikiSummary>> {
  const out = new Map<string, WikiSummary>();
  const todo: string[] = [];
  for (const t of titles) {
    const key = t.trim();
    if (!key) continue;
    const hit = memo.get(key);
    if (hit) out.set(key, hit);
    else if (!todo.includes(key)) todo.push(key);
  }

  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "extracts|pageimages|pageterms|coordinates|pageprops",
      exintro: "1",
      explaintext: "1",
      exsentences: "6",
      exlimit: String(BATCH),
      piprop: "thumbnail",
      pithumbsize: "640",
      wbptterms: "description",
      coprop: "globe",
      coprimary: "all",
      colimit: "max",
      ppprop: "disambiguation",
      titles: chunk.join("|"),
    });
    const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
    let data: ActionResponse;
    try {
      data = await fetchJson<ActionResponse>(url, { salt: "v4" });
    } catch (err) {
      process.stderr.write(`  wikipedia batch failed: ${(err as Error).message.slice(0, 160)}\n`);
      continue;
    }
    const q = data.query;
    if (!q) continue;
    // Map requested → canonical title through normalisation then redirects.
    const forward = new Map<string, string>();
    for (const n of q.normalized ?? []) forward.set(n.from, n.to);
    const redirect = new Map<string, string>();
    for (const r of q.redirects ?? []) redirect.set(r.from, r.to);
    const byTitle = new Map<string, ActionPage>();
    for (const p of q.pages ?? []) byTitle.set(p.title, p);

    for (const requested of chunk) {
      let canonical = forward.get(requested) ?? requested;
      // Follow redirect chains (rare, but cheap).
      for (let hops = 0; hops < 4; hops++) {
        const next = redirect.get(canonical);
        if (!next) break;
        canonical = next;
      }
      const page = byTitle.get(canonical);
      const summary: WikiSummary = page && !page.missing && !page.pageprops?.disambiguation
        ? toSummary(page)
        : {
            title: canonical,
            url: wikiUrl(canonical),
            extract: "",
            description: "",
            image: null,
            lat: null,
            lng: null,
            missing: true,
          };
      memo.set(requested, summary);
      out.set(requested, summary);
    }
  }
  return out;
}

function toSummary(page: ActionPage): WikiSummary {
  const earth = (page.coordinates ?? []).filter((c) => !c.globe || c.globe === "earth");
  const coord = earth.find((c) => c.primary) ?? earth[0];
  return {
    title: page.title,
    url: wikiUrl(page.title),
    extract: (page.extract ?? "").trim(),
    description: (page.terms?.description?.[0] ?? "").trim(),
    image: cleanThumb(page.thumbnail?.source),
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lon : null,
    missing: false,
  };
}

export function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%27/g, "'")}`;
}

/**
 * Wikidata P18 value (a Commons "Special:FilePath" URL) → a direct thumbnail
 * on upload.wikimedia.org, using Commons' md5 path scheme so the browser
 * never has to follow FilePath's two redirects. Only formats whose thumbnail
 * name is predictable (jpg/png/webp) are converted; others return null.
 */
export function commonsThumb(fileUrl: string | undefined, width = 640): string | null {
  if (!fileUrl) return null;
  const m = /Special:FilePath\/(.+)$/.exec(fileUrl);
  if (!m) return null;
  let name: string;
  try {
    name = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  name = name.replace(/ /g, "_").split("?")[0]!;
  if (!/\.(jpe?g|png|webp)$/i.test(name)) return null;
  const hash = createHash("md5").update(name, "utf8").digest("hex");
  const enc = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0, 2)}/${enc}/${width}px-${enc}`;
}

/**
 * Wikidata P18 photos for English article titles, keyed by canonical title.
 * The fallback for articles whose lead image is a map or a size chart.
 */
export async function wikidataImages(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!titles.length) return out;
  const values = titles.map((t) => `<https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}>`).join(" ");
  let rows: { article?: string; image?: string }[] = [];
  try {
    rows = await sparql(
      `SELECT ?article ?image WHERE { VALUES ?article { ${values} } ?article schema:about ?item . ?item wdt:P18 ?image . }`,
      "article images (P18)",
    );
  } catch (err) {
    process.stderr.write(`  P18 lookup failed: ${(err as Error).message.slice(0, 100)}\n`);
    return out;
  }
  for (const r of rows) {
    if (!r.article || !r.image) continue;
    const thumb = commonsThumb(r.image);
    if (!thumb || !isPhotoUrl(thumb)) continue;
    const title = articleTitle(r.article);
    if (!out.has(title)) out.set(title, thumb);
  }
  return out;
}
