import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Polite HTTP for the cache builder.
 *
 * - Every response is cached on disk (scripts/.cache) so re-runs are free.
 * - Wikimedia hosts share one serial queue with spacing: their edge rate-limits
 *   parallel bursts from a single IP with 429s.
 * - 429/5xx retry with exponential backoff and honour Retry-After.
 */

export const USER_AGENT =
  "PinPlanet-cache-builder/0.2 (https://pinplanet.us; contact: steven@midstatelitho.com)";

const CACHE_DIR = join(process.cwd(), "scripts", ".cache");
mkdirSync(CACHE_DIR, { recursive: true });

const WIKIMEDIA = /(^|\.)(wikidata|wikipedia|wikimedia)\.org$/i;

interface Lane {
  chain: Promise<void>;
  spacingMs: number;
  lastEnd: number;
}

const lanes = new Map<string, Lane>();

function laneFor(url: URL): Lane {
  const key = WIKIMEDIA.test(url.hostname) ? "wikimedia" : url.hostname;
  let lane = lanes.get(key);
  if (!lane) {
    lane = { chain: Promise.resolve(), spacingMs: key === "wikimedia" ? 350 : 120, lastEnd: 0 };
    lanes.set(key, lane);
  }
  return lane;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  /** Max age of the on-disk copy; default = forever (rebuild with --fresh). */
  maxAgeMs?: number;
  /** Extra text mixed into the cache key (e.g. a schema version). */
  salt?: string;
  retries?: number;
}

export let fresh = false;
export function setFresh(value: boolean): void {
  fresh = value;
}

let requestCount = 0;
let cacheHits = 0;
export function httpStats(): { requests: number; cacheHits: number } {
  return { requests: requestCount, cacheHits };
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const key = createHash("sha1")
    .update(`${opts.method ?? "GET"} ${url}\n${opts.body ?? ""}\n${opts.salt ?? ""}`)
    .digest("hex");
  const file = join(CACHE_DIR, `${key}.txt`);
  if (!fresh && existsSync(file)) {
    const age = Date.now() - statSync(file).mtimeMs;
    if (opts.maxAgeMs === undefined || age < opts.maxAgeMs) {
      cacheHits += 1;
      return readFileSync(file, "utf8");
    }
  }

  const parsed = new URL(url);
  const lane = laneFor(parsed);
  const run = lane.chain.then(async () => {
    const wait = lane.lastEnd + lane.spacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fetchWithRetry(url, opts);
    } finally {
      lane.lastEnd = Date.now();
    }
  });
  lane.chain = run.then(
    () => undefined,
    () => undefined,
  );
  const text = await run;
  writeFileSync(file, text);
  return text;
}

async function fetchWithRetry(url: string, opts: FetchOptions): Promise<string> {
  const retries = opts.retries ?? 6;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    requestCount += 1;
    let res: Response | null = null;
    let error: unknown = null;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
          ...(opts.headers ?? {}),
        },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      error = err;
    }
    if (res && res.ok) {
      return await res.text();
    }
    const status = res?.status ?? 0;
    const retryable = status === 429 || status === 0 || status >= 500 || status === 408;
    if (!retryable || attempt > retries) {
      const body = res ? (await res.text()).slice(0, 300) : String(error);
      throw new Error(`HTTP ${status} for ${url.slice(0, 160)}: ${body}`);
    }
    const retryAfter = Number(res?.headers.get("retry-after") ?? "0");
    const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 1500 * 2 ** (attempt - 1));
    const jitter = Math.random() * 500;
    process.stderr.write(
      `  ↻ ${status || "net"} on ${new URL(url).hostname}, retry ${attempt}/${retries} in ${Math.round((backoff + jitter) / 1000)}s\n`,
    );
    await sleep(backoff + jitter);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Bad JSON from ${url.slice(0, 120)}: ${(err as Error).message}`);
  }
}
