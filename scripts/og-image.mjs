// Captures public/og-image.jpg — the link-preview picture for Discord, X, Slack…
//
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save playwright-core
//   node scripts/og-image.mjs            # writes candidates to scripts/.cache/og/
//
// Pick the best frame (card open, photo loaded, trail visible) and copy it to
// public/og-image.jpg. 1200×630 CSS px at 2× = 2400×1260, the 1.91:1 ratio
// every preview uses. Point OG_URL / CHROMIUM at other targets if needed.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const url = process.env.OG_URL ?? "http://localhost:4173/";
const out = "scripts/.cache/og";
const frames = 8;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM, // e.g. /opt/pw-browsers/chromium
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });

let n = 0;
let last = "";
for (let i = 0; i < 120 && n < frames; i++) {
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const img = document.getElementById("card-image");
    return {
      open: document.getElementById("card")?.dataset.open === "true",
      loaded: !!img && img.complete && img.naturalWidth > 0,
      title: document.getElementById("card-title")?.textContent ?? "",
    };
  });
  if (!state.open || !state.loaded || state.title === last) continue;
  last = state.title;
  await page.waitForTimeout(1200); // let the card's open transition finish
  const file = `${out}/og-${n}.jpg`;
  await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  console.log(file, "·", state.title);
  n++;
}
await browser.close();
