import { readSetting, writeSetting } from "./providers/store";

/**
 * Themes. One object drives both the HUD (CSS custom properties) and the
 * globe (Three.js material colours/uniforms). Press T to cycle.
 */

export interface ThemeUi {
  bg: number;
  bgDeep: number;
  card: string; // rgba() — cards are translucent
  fg: number;
  dim: number;
  border: number;
  accent: number; // links, active states
  accent2: number; // secondary glow
  warm: number; // highlighted numbers, active pin colour in the HUD
  danger: number; // LIVE badge
  ok: number; // auto-tour LED
  pillFg: number; // text on an accent-coloured pill
}

export interface ThemeGlobe {
  clear: number;
  fog: number; // density
  land: number;
  coast: number;
  ice: number;
  bodyDeep: number;
  bodyEdge: number;
  meridian: number;
  meridianAlpha: number;
  atmoInner: number;
  atmoOuter: number;
  atmoInnerStrength: number;
  atmoOuterStrength: number;
  stars: number;
  starAlpha: number;
  pinNature: number;
  pinHuman: number;
  pinLive: number;
  active: number;
  trailCore: number;
  trailGlow: number;
  grid: number; // HUD dot-grid opacity 0..1
  sun: number; // day/night contrast 0..1
  additive: boolean; // additive blending for glows (dark themes)
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  light: boolean;
  ui: ThemeUi;
  globe: ThemeGlobe;
}

const dark = (overrides: Partial<ThemeGlobe>): ThemeGlobe => ({
  clear: 0x0d0f17,
  fog: 0.022,
  land: 0xbcc9f5,
  coast: 0xa6d3ff,
  ice: 0xd1dbf5,
  bodyDeep: 0x07080d,
  bodyEdge: 0x2e3d6b,
  meridian: 0x565f89,
  meridianAlpha: 0.07,
  atmoInner: 0x7dcfff,
  atmoOuter: 0x7aa2f7,
  atmoInnerStrength: 0.28,
  atmoOuterStrength: 0.46,
  stars: 0xc0caf5,
  starAlpha: 0.6,
  pinNature: 0x7dcfff,
  pinHuman: 0xbb9af7,
  pinLive: 0xff9e64,
  active: 0xff9e64,
  trailCore: 0x7dcfff,
  trailGlow: 0x7aa2f7,
  grid: 0.28,
  sun: 0.55,
  additive: true,
  ...overrides,
});

export const THEMES: Theme[] = [
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    tagline: "the original: indigo dusk, neon coastlines",
    light: false,
    ui: { bg: 0x0d0f17, bgDeep: 0x07080d, card: "rgba(17,19,28,0.9)", fg: 0xc0caf5, dim: 0x565f89, border: 0x3b4261, accent: 0x7aa2f7, accent2: 0x7dcfff, warm: 0xff9e64, danger: 0xf7768e, ok: 0x9ece6a, pillFg: 0x07080d },
    globe: dark({}),
  },
  {
    id: "ember",
    name: "Ember",
    tagline: "volcanic: black basalt, glowing lava lines",
    light: false,
    ui: { bg: 0x0b0605, bgDeep: 0x050201, card: "rgba(20,10,7,0.9)", fg: 0xf3d9c4, dim: 0x7a5546, border: 0x4a2b21, accent: 0xff7a3d, accent2: 0xffb26b, warm: 0xffd166, danger: 0xff3b3b, ok: 0xffb26b, pillFg: 0x1a0905 },
    globe: dark({
      clear: 0x0b0605,
      land: 0xf0a56a,
      coast: 0xffd7a8,
      ice: 0xe8c9b0,
      bodyDeep: 0x120806,
      bodyEdge: 0x6b2a12,
      meridian: 0x7a5546,
      atmoInner: 0xff8a3d,
      atmoOuter: 0xff5a1f,
      atmoInnerStrength: 0.3,
      atmoOuterStrength: 0.5,
      stars: 0xf3d9c4,
      starAlpha: 0.45,
      pinNature: 0xffb26b,
      pinHuman: 0xff6b6b,
      pinLive: 0xfff275,
      active: 0xffd166,
      trailCore: 0xffb26b,
      trailGlow: 0xff5a1f,
      sun: 0.65,
    }),
  },
  {
    id: "arctic",
    name: "Arctic",
    tagline: "ice-white land on a near-black sea",
    light: false,
    ui: { bg: 0x050a12, bgDeep: 0x02050a, card: "rgba(8,14,24,0.9)", fg: 0xe6f3ff, dim: 0x5e7a94, border: 0x24384f, accent: 0x7fe3ff, accent2: 0xffffff, warm: 0xfff275, danger: 0xff6b8a, ok: 0x9cf5d0, pillFg: 0x02050a },
    globe: dark({
      clear: 0x050a12,
      land: 0xd6ecff,
      coast: 0xffffff,
      ice: 0xffffff,
      bodyDeep: 0x050b14,
      bodyEdge: 0x1b3a5c,
      meridian: 0x5e7a94,
      meridianAlpha: 0.09,
      atmoInner: 0x9fe3ff,
      atmoOuter: 0x5fb8ff,
      atmoInnerStrength: 0.32,
      atmoOuterStrength: 0.5,
      stars: 0xe6f3ff,
      starAlpha: 0.7,
      pinNature: 0x7fe3ff,
      pinHuman: 0xffffff,
      pinLive: 0xfff275,
      active: 0xfff275,
      trailCore: 0xffffff,
      trailGlow: 0x7fe3ff,
      sun: 0.45,
    }),
  },
  {
    id: "phosphor",
    name: "Phosphor",
    tagline: "green terminal glass, 1983",
    light: false,
    ui: { bg: 0x020604, bgDeep: 0x010302, card: "rgba(3,12,7,0.9)", fg: 0xbaffd4, dim: 0x2f8a5a, border: 0x1d4a33, accent: 0x59ff9c, accent2: 0x9dffc7, warm: 0xeaffb0, danger: 0xffb347, ok: 0x59ff9c, pillFg: 0x010302 },
    globe: dark({
      clear: 0x020604,
      fog: 0.02,
      land: 0x35d07f,
      coast: 0x9dffc7,
      ice: 0x7ce8a8,
      bodyDeep: 0x020806,
      bodyEdge: 0x0f5a34,
      meridian: 0x2f8a5a,
      meridianAlpha: 0.12,
      atmoInner: 0x59ff9c,
      atmoOuter: 0x1fbf6b,
      atmoInnerStrength: 0.3,
      atmoOuterStrength: 0.45,
      stars: 0xbaffd4,
      starAlpha: 0.4,
      pinNature: 0x9dffc7,
      pinHuman: 0x59ff9c,
      pinLive: 0xffffff,
      active: 0xeaffea,
      trailCore: 0xeaffea,
      trailGlow: 0x59ff9c,
      grid: 0.45,
      sun: 0.4,
    }),
  },
  {
    id: "synthwave",
    name: "Synthwave",
    tagline: "magenta horizon, chrome and cyan",
    light: false,
    ui: { bg: 0x12061f, bgDeep: 0x090212, card: "rgba(24,8,40,0.9)", fg: 0xf6d6ff, dim: 0x7c5a9c, border: 0x4a2a6e, accent: 0xff4fd8, accent2: 0x4ff2ff, warm: 0xfff275, danger: 0xff3b6b, ok: 0x4ff2ff, pillFg: 0x090212 },
    globe: dark({
      clear: 0x12061f,
      land: 0xc77dff,
      coast: 0xff8fd8,
      ice: 0xe4c6ff,
      bodyDeep: 0x14061f,
      bodyEdge: 0x6a1f8f,
      meridian: 0x7c5a9c,
      meridianAlpha: 0.1,
      atmoInner: 0xff4fd8,
      atmoOuter: 0x4ff2ff,
      atmoInnerStrength: 0.3,
      atmoOuterStrength: 0.48,
      stars: 0xf6d6ff,
      starAlpha: 0.6,
      pinNature: 0x4ff2ff,
      pinHuman: 0xff4fd8,
      pinLive: 0xfff275,
      active: 0xfff275,
      trailCore: 0x4ff2ff,
      trailGlow: 0xff4fd8,
      sun: 0.5,
    }),
  },
  {
    id: "blueprint",
    name: "Blueprint",
    tagline: "drafting-table cyanotype, white ink",
    light: false,
    ui: { bg: 0x0b2a5b, bgDeep: 0x071d40, card: "rgba(8,32,72,0.92)", fg: 0xeaf2ff, dim: 0x8fb0e0, border: 0x3d6db3, accent: 0xffffff, accent2: 0xbfe0ff, warm: 0xffd166, danger: 0xff8a8a, ok: 0xbfe0ff, pillFg: 0x0b2a5b },
    globe: dark({
      clear: 0x0b2a5b,
      fog: 0.018,
      land: 0xdbe9ff,
      coast: 0xffffff,
      ice: 0xffffff,
      bodyDeep: 0x0d2f66,
      bodyEdge: 0x2c62b8,
      meridian: 0xbfe0ff,
      meridianAlpha: 0.18,
      atmoInner: 0xffffff,
      atmoOuter: 0x8fc3ff,
      atmoInnerStrength: 0.22,
      atmoOuterStrength: 0.36,
      stars: 0xeaf2ff,
      starAlpha: 0.25,
      pinNature: 0xffffff,
      pinHuman: 0xffd166,
      pinLive: 0xff8a8a,
      active: 0xffd166,
      trailCore: 0xffffff,
      trailGlow: 0xbfe0ff,
      grid: 0.6,
      sun: 0.3,
    }),
  },
  {
    id: "aurora",
    name: "Aurora",
    tagline: "polar night, green curtains, violet edge",
    light: false,
    ui: { bg: 0x061018, bgDeep: 0x03090e, card: "rgba(8,20,28,0.9)", fg: 0xd7fff2, dim: 0x4f8a7a, border: 0x1f4a44, accent: 0x59ffb8, accent2: 0xb388ff, warm: 0xffd166, danger: 0xff6b8a, ok: 0x59ffb8, pillFg: 0x03090e },
    globe: dark({
      clear: 0x061018,
      land: 0x8fe8cc,
      coast: 0xe0fff4,
      ice: 0xd7fff2,
      bodyDeep: 0x07131b,
      bodyEdge: 0x1d5a5a,
      meridian: 0x4f8a7a,
      atmoInner: 0x59ffb8,
      atmoOuter: 0xb388ff,
      atmoInnerStrength: 0.3,
      atmoOuterStrength: 0.5,
      stars: 0xd7fff2,
      starAlpha: 0.65,
      pinNature: 0x59ffb8,
      pinHuman: 0xb388ff,
      pinLive: 0xffd166,
      active: 0xffd166,
      trailCore: 0xd7fff2,
      trailGlow: 0x59ffb8,
      sun: 0.5,
    }),
  },
  {
    id: "noir",
    name: "Noir",
    tagline: "monochrome, one red thread",
    light: false,
    ui: { bg: 0x000000, bgDeep: 0x000000, card: "rgba(10,10,10,0.92)", fg: 0xf2f2f2, dim: 0x6e6e6e, border: 0x333333, accent: 0xffffff, accent2: 0xbdbdbd, warm: 0xff3b3b, danger: 0xff3b3b, ok: 0xbdbdbd, pillFg: 0x000000 },
    globe: dark({
      clear: 0x000000,
      fog: 0.016,
      land: 0x9a9a9a,
      coast: 0xffffff,
      ice: 0xcfcfcf,
      bodyDeep: 0x050505,
      bodyEdge: 0x3a3a3a,
      meridian: 0x6e6e6e,
      meridianAlpha: 0.08,
      atmoInner: 0xffffff,
      atmoOuter: 0x9a9a9a,
      atmoInnerStrength: 0.18,
      atmoOuterStrength: 0.32,
      stars: 0xffffff,
      starAlpha: 0.5,
      pinNature: 0xdedede,
      pinHuman: 0x9a9a9a,
      pinLive: 0xff3b3b,
      active: 0xff3b3b,
      trailCore: 0xffffff,
      trailGlow: 0x9a9a9a,
      grid: 0.2,
      sun: 0.6,
    }),
  },
  {
    id: "parchment",
    name: "Parchment",
    tagline: "an old atlas: sepia ink on cream",
    light: true,
    ui: { bg: 0xf1e7d0, bgDeep: 0xe6d8b8, card: "rgba(250,244,228,0.94)", fg: 0x3b2a14, dim: 0x8a7350, border: 0xcdbb95, accent: 0xb5452a, accent2: 0x1b6b7b, warm: 0xb5452a, danger: 0xb5452a, ok: 0x4f7a3a, pillFg: 0xfaf4e4 },
    globe: {
      clear: 0xf1e7d0,
      fog: 0.012,
      land: 0x6b4f2a,
      coast: 0x2f1f0d,
      ice: 0x9c8a6a,
      bodyDeep: 0xe6d8b8,
      bodyEdge: 0xcdbb95,
      meridian: 0x8a7350,
      meridianAlpha: 0.22,
      atmoInner: 0x6b4f2a,
      atmoOuter: 0x8a7350,
      atmoInnerStrength: 0.12,
      atmoOuterStrength: 0.2,
      stars: 0x8a7350,
      starAlpha: 0,
      pinNature: 0x1b6b7b,
      pinHuman: 0xb5452a,
      pinLive: 0xd98e04,
      active: 0xb5452a,
      trailCore: 0xb5452a,
      trailGlow: 0x6b4f2a,
      grid: 0.5,
      sun: 0.35,
      additive: false,
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    tagline: "clean paper-white, ink-blue continents",
    light: true,
    ui: { bg: 0xeef3f8, bgDeep: 0xdfe7f0, card: "rgba(255,255,255,0.94)", fg: 0x1a2636, dim: 0x6b7b8f, border: 0xc5d0dc, accent: 0x0b74de, accent2: 0x0aa2c0, warm: 0xe6521f, danger: 0xd92d2d, ok: 0x1f9d55, pillFg: 0xffffff },
    globe: {
      clear: 0xeef3f8,
      fog: 0.012,
      land: 0x2c3e50,
      coast: 0x0b74de,
      ice: 0x8ea3b8,
      bodyDeep: 0xdfe7f0,
      bodyEdge: 0xb9c8d8,
      meridian: 0x6b7b8f,
      meridianAlpha: 0.2,
      atmoInner: 0x0b74de,
      atmoOuter: 0x5a8fc8,
      atmoInnerStrength: 0.12,
      atmoOuterStrength: 0.22,
      stars: 0x6b7b8f,
      starAlpha: 0,
      pinNature: 0x0aa2c0,
      pinHuman: 0xe6521f,
      pinLive: 0xd92d2d,
      active: 0xe6521f,
      trailCore: 0xe6521f,
      trailGlow: 0x0b74de,
      grid: 0.5,
      sun: 0.3,
      additive: false,
    },
  },
];

export function cssHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function rgba(n: number, alpha: number): string {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Push a theme into CSS custom properties on <html>. */
export function applyThemeCss(theme: Theme): void {
  const root = document.documentElement;
  const u = theme.ui;
  const g = theme.globe;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--bg", cssHex(u.bg));
  set("--bg-deep", cssHex(u.bgDeep));
  set("--bg-card", u.card);
  set("--fg", cssHex(u.fg));
  set("--dim", cssHex(u.dim));
  set("--border", cssHex(u.border));
  set("--accent", cssHex(u.accent));
  set("--accent-2", cssHex(u.accent2));
  set("--warm", cssHex(u.warm));
  set("--danger", cssHex(u.danger));
  set("--ok", cssHex(u.ok));
  set("--pill-fg", cssHex(u.pillFg));
  set("--accent-glow", rgba(u.accent, 0.5));
  set("--accent-glow-soft", rgba(u.accent2, 0.2));
  set("--accent-line", rgba(u.accent, 0.12));
  set("--pin-nature", cssHex(g.pinNature));
  set("--pin-human", cssHex(g.pinHuman));
  set("--pin-live", cssHex(g.pinLive));
  set("--grid-alpha", String(g.grid));
  set("--grid-dot", rgba(u.border, 0.55));
  set("--shadow", theme.light ? "rgba(40,30,10,0.18)" : "rgba(0,0,0,0.55)");
  root.dataset.theme = theme.id;
  root.dataset.light = theme.light ? "true" : "false";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", cssHex(u.bg));
}

const SETTING = "theme";

export class ThemeManager {
  index: number;
  private readonly listeners: ((theme: Theme) => void)[] = [];

  constructor() {
    const saved = readSetting(SETTING);
    const idx = THEMES.findIndex((t) => t.id === saved);
    this.index = idx >= 0 ? idx : 0;
  }

  get theme(): Theme {
    return THEMES[this.index]!;
  }

  onChange(listener: (theme: Theme) => void): void {
    this.listeners.push(listener);
  }

  apply(): void {
    applyThemeCss(this.theme);
    for (const l of this.listeners) l(this.theme);
  }

  next(step = 1): Theme {
    this.index = (this.index + step + THEMES.length) % THEMES.length;
    writeSetting(SETTING, this.theme.id);
    this.apply();
    return this.theme;
  }

  set(id: string): Theme {
    const idx = THEMES.findIndex((t) => t.id === id);
    if (idx >= 0) {
      this.index = idx;
      writeSetting(SETTING, this.theme.id);
      this.apply();
    }
    return this.theme;
  }
}
