/** Text helpers: turn encyclopedia intros into ≤280-character facts. */

export const FACT_MAX = 280;

const ABBREV =
  /\b(Mt|Mts|St|Sts|Dr|Mr|Mrs|Ms|Prof|Gen|Col|Capt|Lt|Sgt|Cpl|Adm|Sr|Jr|vs|etc|approx|ca|c|No|Fig|km|mi|ft|m|cm|kg|lb|U\.S|U\.K|E\.g|I\.e|e\.g|i\.e|a\.m|p\.m|Inc|Ltd|Co|Corp|Ave|Blvd|Rd|Hwy|Mtn|Is|Pt|Ft|Sq|Bros|Dept|Univ|Gov|Rev|Hon|Msgr|Fr|Br|Ste|Mme|Mlle|vol|no|pp|ed|eds|trans|b|d|r|fl|est)\.$/;

/** Split into sentences without breaking on common abbreviations. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/);
  let buffer = "";
  for (const part of parts) {
    buffer = buffer ? `${buffer} ${part}` : part;
    const lastWord = buffer.split(" ").pop() ?? "";
    if (ABBREV.test(lastWord) || /\b[A-Z]\.$/.test(buffer)) continue; // "St." / initials
    out.push(buffer);
    buffer = "";
  }
  if (buffer) out.push(buffer);
  return out.filter((s) => s.length > 0);
}

/**
 * Remove the noise Wikipedia intros carry: empty "()" left by stripped
 * pronunciations, parentheticals full of transliterations, "listen" links,
 * citation brackets, and stray spaces before punctuation.
 */
export function cleanExtract(text: string): string {
  let t = text.replace(/\s+/g, " ");
  t = t.replace(/\[[^\]]*\]/g, ""); // [1], [note 2]
  // Drop parentheticals that are pronunciation/etymology/foreign-name noise.
  // Innermost first; kept groups are masked so outer groups can be judged.
  const OPEN = "\u0001";
  const CLOSE = "\u0002";
  for (let pass = 0; pass < 4; pass++) {
    const before = t;
    t = t.replace(/\s*\(([^()]*)\)/g, (whole, inner: string) => {
      const s = inner.replace(/[\u0001\u0002]/g, "").trim();
      if (!s || /^[;,:\s]+$/.test(s)) return "";
      if (/^(c\.|ca\.|circa|born|died|d\.|b\.|fl\.|r\.|reigned|\d)/i.test(s) && s.length <= 40) return whole.replace("(", OPEN).replace(/\)$/, CLOSE);
      if (/[/ɐ-ʯ̀-ͯ]/.test(s)) return ""; // IPA
      if (/^[;,:\s]/.test(s)) return ""; // "(; lit. 'swift thief')" — leftovers of a stripped pronunciation
      if (/\b(lit|transl|translit|abbr|pron)\./i.test(s)) return "";
      if (/\b(listen|pronounced|pronunciation|literally|romanized|romanised|transliterated|also (known|called|spelled|written)|formerly|abbreviated|acronym)\b/i.test(s)) return "";
      if (LANGUAGES.test(s)) return "";
      if (/[^\x00-\x7F]/.test(s) && s.length > 12) return ""; // non-Latin scripts
      if (s.length > 70) return "";
      return whole.replace("(", OPEN).replace(/\)$/, CLOSE);
    });
    if (t === before) break;
  }
  // An unbalanced "(" is what the API leaves behind when it strips nested
  // pronunciation markup: drop from it to the sentence's main verb, else to
  // the end of the sentence. A stray ")" is simply removed.
  t = t.replace(/\s*\([^.()]*?(?= (is|was|are|were|has|had|lies|stands|sits|rises|forms|refers|remains|became|consists) )/g, "");
  t = t.replace(/\s*\([^.()]*(?=\.|$)/g, "");
  t = t.replace(/\s*\([^()]*$/g, "");
  t = t.replace(/\)/g, "");
  t = t.replace(/\u0001/g, "(").replace(/\u0002/g, ")");
  t = t.replace(/\s+([,.;:!?])/g, "$1");
  t = t.replace(/\(\s*\)/g, "");
  t = t.replace(/,\s*,/g, ",");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

const LANGUAGES =
  /\b(Latin|Greek|Arabic|Hebrew|Russian|Chinese|Japanese|Spanish|French|German|Italian|Portuguese|Hindi|Sanskrit|Persian|Turkish|Korean|Thai|Vietnamese|Icelandic|Norwegian|Swedish|Danish|Finnish|Polish|Czech|Hungarian|Dutch|Welsh|Irish|Gaelic|Māori|Maori|Hawaiian|Inuktitut|Quechua|Aymara|Nahuatl|Mongolian|Tibetan|Nepali|Bengali|Tamil|Urdu|Swahili|Zulu|Afrikaans|Georgian|Armenian|Ukrainian|Serbian|Croatian|Bulgarian|Romanian|Latvian|Lithuanian|Estonian|Basque|Catalan|Galician|Sinhala|Burmese|Khmer|Lao|Malay|Indonesian|Tagalog|Filipino|Amharic|Tigrinya|Somali|Yoruba|Hausa|Igbo|Kazakh|Uzbek|Kyrgyz|Tajik|Turkmen|Azerbaijani|Pashto|Dari|Kurdish|Punjabi|Gujarati|Marathi|Telugu|Kannada|Malayalam|Odia|Assamese|Cantonese|Mandarin|Hokkien|Okinawan|Ainu|Sami|Faroese|Greenlandic|Yupik|Cherokee|Navajo|Lakota|Guarani|Mapuche|Samoan|Tongan|Fijian|Tahitian|Malagasy|Sinhalese|Dzongkha|Pali|Old English|Middle English|Old Norse|Ancient Greek|Egyptian|Akkadian|Sumerian|Aramaic|Syriac|Coptic|Berber|Tamazight|Wolof|Shona|Xhosa|Sotho|Tswana|Kinyarwanda|Luganda|Oromo)\b/;

/**
 * Take whole sentences while they fit; if not even one fits, clip the first
 * cleanly. A very short result borrows a clipped slice of the next sentence
 * so a fact never reads as a bare definition.
 */
export function fitSentences(text: string, max: number, focus?: RegExp): string {
  const list = sentences(text);
  let out = "";
  let used = 0;
  for (const s of list) {
    const next = out ? `${out} ${s}` : s;
    if (next.length <= max) {
      out = next;
      used += 1;
    } else break;
  }
  if (!out) {
    const first = list[0] ?? "";
    return first ? clip(first, max) : "";
  }
  // The sentence that carries the point (e.g. how the ship sank) beats filler.
  if (focus && !focus.test(out)) {
    const hit = list.slice(used).find((s) => focus.test(s));
    if (hit) {
      const lead = list[0] ?? "";
      const room = max - lead.length - 1;
      if (room >= 50) return `${lead} ${hit.length <= room ? hit : clip(hit, room)}`;
    }
  }
  if (out.length < 90 && list[used]) {
    const room = max - out.length - 1;
    if (room >= 40) out = `${out} ${clip(list[used]!, room)}`;
  }
  return out;
}

/** Clip at a clause boundary and add an ellipsis; never leaves a parenthesis open. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const stop = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(", "), cut.lastIndexOf(" — "), cut.lastIndexOf(" – "));
  let body = stop > max * 0.45 ? cut.slice(0, stop) : cut.slice(0, cut.lastIndexOf(" "));
  const opens = (body.match(/\(/g) ?? []).length;
  const closes = (body.match(/\)/g) ?? []).length;
  if (opens > closes) body = body.slice(0, body.lastIndexOf("("));
  return `${body.replace(/[,;:\s]+$/, "")}…`;
}

/** hook + body → one fact ≤ max. The hook is kept verbatim; the body flexes. */
export function composeFact(hook: string | null, body: string, max = FACT_MAX, focus?: RegExp): string {
  const h = (hook ?? "").trim();
  const b = cleanExtract(body);
  if (!h) return fitSentences(b, max, focus) || "";
  const room = max - h.length - 1;
  if (room < 40) return clip(h, max);
  const tail = fitSentences(b, room, focus);
  return tail ? `${h} ${tail}` : h;
}

/** Does the text already mention this number/year? (avoid "1815. The battle of 1815…") */
export function mentions(text: string, token: string | number | null | undefined): boolean {
  if (token === null || token === undefined) return false;
  return text.includes(String(token));
}

const STROKED: Record<string, string> = {
  Ħ: "H", ħ: "h", Ø: "O", ø: "o", Đ: "D", đ: "d", Ł: "L", ł: "l", ß: "ss", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe",
  Þ: "TH", þ: "th", Ð: "D", ð: "d", ı: "i", Ŧ: "T", ŧ: "t", Ɨ: "I", ɨ: "i", ƶ: "z", Ƶ: "Z",
};

/** Lower-case, ASCII-only slug: letters that don't decompose (Ħ, Ø, Ł…) are mapped by hand. */
export function slugify(input: string): string {
  return input
    .replace(/[ĦħØøĐđŁłßÆæŒœÞþÐðıŦŧƗɨƶƵ]/g, (c) => STROKED[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 3776 → "3,776"; 12.5 → "12.5" */
export function fmtNum(n: number, digits = 1): string {
  if (Math.abs(n) >= 100 || Number.isInteger(n)) return fmtInt(n);
  return n.toFixed(digits).replace(/\.0$/, "");
}

export function eraYear(year: number): string {
  if (year < 0) return `${fmtInt(-year)} BCE`;
  if (year < 1000) return `${year} CE`;
  return String(year);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** ISO-ish Wikidata time → "18 June 1815" / "479 BCE". Precision unknown, so
 *  January 1st dates are treated as year-only (Wikidata's usual convention). */
export function dateLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year)) return null;
  if (year < 1000 || (month === 1 && day === 1) || month === 0) return eraYear(year);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Millions of years, nicely. */
export function fmtMa(ma: number): string {
  if (ma >= 100) return `${fmtInt(ma)} million`;
  if (ma >= 10) return `${Math.round(ma)} million`;
  if (ma >= 1) return `${ma.toFixed(1).replace(/\.0$/, "")} million`;
  if (ma >= 0.01) return `${fmtInt(ma * 1000)} thousand`;
  return `${fmtInt(ma * 1_000_000)}`;
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
