import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhotoUrl } from "../../src/imagery";
import { summaries, wikidataImages } from "./wikipedia";

/**
 * Give the 29 hand-written seeds a lead photo from their Wikipedia article.
 *   npx tsx scripts/cache/seedImages.ts
 * Keeps data/seed-pins.json minified with sorted keys, as it is checked in.
 */
async function main(): Promise<void> {
  const file = join(process.cwd(), "data", "seed-pins.json");
  const seeds = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
  const titles = seeds.map((s) => decodeURIComponent(String(s.story_url).replace(/^.*\/wiki\//, "")).replace(/_/g, " "));
  const wiki = await summaries(titles);
  const p18 = await wikidataImages(titles);
  let added = 0;
  seeds.forEach((seed, i) => {
    const summary = wiki.get(titles[i]!);
    const photo =
      summary && !summary.missing && summary.image && isPhotoUrl(summary.image)
        ? summary.image
        : p18.get(summary?.title ?? titles[i]!) ?? p18.get(titles[i]!) ?? null;
    if (photo) {
      seed.image_url = photo;
      added += 1;
    } else process.stderr.write(`  no photo for ${seed.id}\n`);
  });
  const sorted = seeds.map((s) => Object.fromEntries(Object.entries(s).sort(([a], [b]) => a.localeCompare(b))));
  writeFileSync(file, JSON.stringify(sorted));
  process.stderr.write(`seed images: ${added}/${seeds.length}\n`);
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
