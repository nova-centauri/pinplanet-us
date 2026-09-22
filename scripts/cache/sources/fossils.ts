import { fetchJson } from "../http";
import { CREDIT, type BuildContext, type CachedPin } from "../types";
import { isPhotoUrl } from "../../../src/imagery";
import { classQuery, sparql } from "../wikidata";
import { summaries, wikidataImages } from "../wikipedia";
import { cleanExtract, fitSentences, fmtMa, slugify } from "../text";
import { dedupeById, pinsFromWikidata, round } from "./common";

/**
 * Fossil record. Two feeds:
 *  1. Paleobiology Database occurrences for famous extinct genera — where
 *     the bones actually came out of the ground (CC BY 4.0).
 *  2. Wikidata lagerstätten & paleontological sites (Burgess Shale, Messel…).
 */

interface Occ {
  oid: string;
  tna: string;
  lat: string;
  lng: string;
  cc2?: string;
  stp?: string;
  cny?: string;
  oei?: string;
  eag?: number;
  lag?: number;
  cid?: string;
}

/** [PBDB taxon, Wikipedia title, friendly noun] — ordered roughly by fame. */
const GENERA: [string, string, string][] = [
  ["Tyrannosaurus", "Tyrannosaurus", "Tyrannosaurus"],
  ["Triceratops", "Triceratops", "Triceratops"],
  ["Velociraptor", "Velociraptor", "Velociraptor"],
  ["Stegosaurus", "Stegosaurus", "Stegosaurus"],
  ["Brachiosaurus", "Brachiosaurus", "Brachiosaurus"],
  ["Diplodocus", "Diplodocus", "Diplodocus"],
  ["Apatosaurus", "Apatosaurus", "Apatosaurus"],
  ["Allosaurus", "Allosaurus", "Allosaurus"],
  ["Spinosaurus", "Spinosaurus", "Spinosaurus"],
  ["Giganotosaurus", "Giganotosaurus", "Giganotosaurus"],
  ["Argentinosaurus", "Argentinosaurus", "Argentinosaurus"],
  ["Ankylosaurus", "Ankylosaurus", "Ankylosaurus"],
  ["Iguanodon", "Iguanodon", "Iguanodon"],
  ["Megalosaurus", "Megalosaurus", "Megalosaurus"],
  ["Archaeopteryx", "Archaeopteryx", "Archaeopteryx"],
  ["Ichthyosaurus", "Ichthyosaurus", "Ichthyosaurus"],
  ["Plesiosaurus", "Plesiosaurus", "Plesiosaurus"],
  ["Mosasaurus", "Mosasaurus", "Mosasaurus"],
  ["Pteranodon", "Pteranodon", "Pteranodon"],
  ["Quetzalcoatlus", "Quetzalcoatlus", "Quetzalcoatlus"],
  ["Dunkleosteus", "Dunkleosteus", "Dunkleosteus"],
  ["Tiktaalik", "Tiktaalik", "Tiktaalik"],
  ["Anomalocaris", "Anomalocaris", "Anomalocaris"],
  ["Mammuthus", "Mammoth", "Mammoth"],
  ["Smilodon", "Smilodon", "Sabre-toothed cat (Smilodon)"],
  ["Megatherium", "Megatherium", "Giant ground sloth (Megatherium)"],
  ["Glyptodon", "Glyptodon", "Glyptodon"],
  ["Australopithecus", "Australopithecus", "Australopithecus"],
  ["Otodus megalodon", "Megalodon", "Megalodon"],
  ["Dimetrodon", "Dimetrodon", "Dimetrodon"],
  ["Titanoboa", "Titanoboa", "Titanoboa"],
  ["Deinonychus", "Deinonychus", "Deinonychus"],
  ["Utahraptor", "Utahraptor", "Utahraptor"],
  ["Carnotaurus", "Carnotaurus", "Carnotaurus"],
  ["Therizinosaurus", "Therizinosaurus", "Therizinosaurus"],
  ["Pachycephalosaurus", "Pachycephalosaurus", "Pachycephalosaurus"],
  ["Parasaurolophus", "Parasaurolophus", "Parasaurolophus"],
  ["Maiasaura", "Maiasaura", "Maiasaura"],
  ["Oviraptor", "Oviraptor", "Oviraptor"],
  ["Protoceratops", "Protoceratops", "Protoceratops"],
  ["Psittacosaurus", "Psittacosaurus", "Psittacosaurus"],
  ["Sinosauropteryx", "Sinosauropteryx", "Sinosauropteryx"],
  ["Yutyrannus", "Yutyrannus", "Yutyrannus"],
  ["Microraptor", "Microraptor", "Microraptor"],
  ["Confuciusornis", "Confuciusornis", "Confuciusornis"],
  ["Hallucigenia", "Hallucigenia", "Hallucigenia"],
  ["Opabinia", "Opabinia", "Opabinia"],
  ["Meganeura", "Meganeura", "Meganeura"],
  ["Arthropleura", "Arthropleura", "Arthropleura"],
  ["Paraceratherium", "Paraceratherium", "Paraceratherium"],
  ["Basilosaurus", "Basilosaurus", "Basilosaurus"],
  ["Ambulocetus", "Ambulocetus", "Ambulocetus"],
  ["Andrewsarchus", "Andrewsarchus", "Andrewsarchus"],
  ["Gigantopithecus", "Gigantopithecus", "Gigantopithecus"],
  ["Thylacoleo", "Thylacoleo", "Marsupial lion (Thylacoleo)"],
  ["Diprotodon", "Diprotodon", "Diprotodon"],
  ["Dinornis", "Moa", "Giant moa (Dinornis)"],
  ["Aepyornis", "Elephant bird", "Elephant bird (Aepyornis)"],
  ["Raphus cucullatus", "Dodo", "Dodo"],
  ["Coelodonta", "Woolly rhinoceros", "Woolly rhinoceros"],
  ["Ursus spelaeus", "Cave bear", "Cave bear"],
  ["Megaloceros", "Irish elk", "Irish elk (Megaloceros)"],
  ["Homo neanderthalensis", "Neanderthal", "Neanderthal"],
  ["Homo erectus", "Homo erectus", "Homo erectus"],
  ["Homo floresiensis", "Homo floresiensis", "Homo floresiensis"],
  ["Homo naledi", "Homo naledi", "Homo naledi"],
  ["Paranthropus", "Paranthropus", "Paranthropus"],
  ["Ardipithecus", "Ardipithecus", "Ardipithecus"],
  ["Sahelanthropus", "Sahelanthropus", "Sahelanthropus"],
  ["Dickinsonia", "Dickinsonia", "Dickinsonia"],
  ["Charnia", "Charnia", "Charnia"],
  ["Eurypterus", "Eurypterus", "Eurypterus (sea scorpion)"],
  ["Jaekelopterus", "Jaekelopterus", "Jaekelopterus"],
  ["Coelophysis", "Coelophysis", "Coelophysis"],
  ["Plateosaurus", "Plateosaurus", "Plateosaurus"],
  ["Herrerasaurus", "Herrerasaurus", "Herrerasaurus"],
  ["Eoraptor", "Eoraptor", "Eoraptor"],
  ["Dilophosaurus", "Dilophosaurus", "Dilophosaurus"],
  ["Ceratosaurus", "Ceratosaurus", "Ceratosaurus"],
  ["Baryonyx", "Baryonyx", "Baryonyx"],
  ["Carcharodontosaurus", "Carcharodontosaurus", "Carcharodontosaurus"],
  ["Tarbosaurus", "Tarbosaurus", "Tarbosaurus"],
  ["Albertosaurus", "Albertosaurus", "Albertosaurus"],
  ["Gorgosaurus", "Gorgosaurus", "Gorgosaurus"],
  ["Edmontosaurus", "Edmontosaurus", "Edmontosaurus"],
  ["Hadrosaurus", "Hadrosaurus", "Hadrosaurus"],
  ["Styracosaurus", "Styracosaurus", "Styracosaurus"],
  ["Kentrosaurus", "Kentrosaurus", "Kentrosaurus"],
  ["Amargasaurus", "Amargasaurus", "Amargasaurus"],
  ["Patagotitan", "Patagotitan", "Patagotitan"],
  ["Dreadnoughtus", "Dreadnoughtus", "Dreadnoughtus"],
  ["Mamenchisaurus", "Mamenchisaurus", "Mamenchisaurus"],
  ["Nigersaurus", "Nigersaurus", "Nigersaurus"],
  ["Ouranosaurus", "Ouranosaurus", "Ouranosaurus"],
  ["Leaellynasaura", "Leaellynasaura", "Leaellynasaura"],
  ["Muttaburrasaurus", "Muttaburrasaurus", "Muttaburrasaurus"],
  ["Cryolophosaurus", "Cryolophosaurus", "Cryolophosaurus"],
  ["Rajasaurus", "Rajasaurus", "Rajasaurus"],
  ["Kronosaurus", "Kronosaurus", "Kronosaurus"],
  ["Elasmosaurus", "Elasmosaurus", "Elasmosaurus"],
  ["Liopleurodon", "Liopleurodon", "Liopleurodon"],
  ["Shonisaurus", "Shonisaurus", "Shonisaurus"],
  ["Tanystropheus", "Tanystropheus", "Tanystropheus"],
  ["Postosuchus", "Postosuchus", "Postosuchus"],
  ["Deinosuchus", "Deinosuchus", "Deinosuchus"],
  ["Sarcosuchus", "Sarcosuchus", "Sarcosuchus"],
  ["Purussaurus", "Purussaurus", "Purussaurus"],
  ["Varanus priscus", "Megalania", "Megalania"],
  ["Gastornis", "Gastornis", "Gastornis"],
  ["Phorusrhacos", "Phorusrhacos", "Terror bird (Phorusrhacos)"],
  ["Argentavis", "Argentavis", "Argentavis"],
  ["Pelagornis", "Pelagornis", "Pelagornis"],
  ["Hesperornis", "Hesperornis", "Hesperornis"],
  ["Castoroides", "Castoroides", "Giant beaver (Castoroides)"],
  ["Arctodus", "Arctodus", "Short-faced bear (Arctodus)"],
  ["Panthera atrox", "Panthera atrox", "American lion"],
  ["Aenocyon dirus", "Dire wolf", "Dire wolf"],
  ["Mammut", "Mastodon", "Mastodon"],
  ["Elasmotherium", "Elasmotherium", "Elasmotherium"],
  ["Deinotherium", "Deinotherium", "Deinotherium"],
  ["Platybelodon", "Platybelodon", "Platybelodon"],
  ["Chalicotherium", "Chalicotherium", "Chalicotherium"],
  ["Macrauchenia", "Macrauchenia", "Macrauchenia"],
  ["Toxodon", "Toxodon", "Toxodon"],
  ["Doedicurus", "Doedicurus", "Doedicurus"],
  ["Thylacinus", "Thylacine", "Thylacine"],
  ["Procoptodon", "Procoptodon", "Procoptodon (giant kangaroo)"],
  ["Meiolania", "Meiolania", "Meiolania"],
  ["Helicoprion", "Helicoprion", "Helicoprion"],
  ["Leedsichthys", "Leedsichthys", "Leedsichthys"],
  ["Xiphactinus", "Xiphactinus", "Xiphactinus"],
  ["Eusthenopteron", "Eusthenopteron", "Eusthenopteron"],
  ["Acanthostega", "Acanthostega", "Acanthostega"],
  ["Ichthyostega", "Ichthyostega", "Ichthyostega"],
  ["Diplocaulus", "Diplocaulus", "Diplocaulus"],
  ["Eryops", "Eryops", "Eryops"],
  ["Lystrosaurus", "Lystrosaurus", "Lystrosaurus"],
  ["Inostrancevia", "Inostrancevia", "Inostrancevia"],
  ["Moschops", "Moschops", "Moschops"],
  ["Estemmenosuchus", "Estemmenosuchus", "Estemmenosuchus"],
  ["Cynognathus", "Cynognathus", "Cynognathus"],
  ["Thrinaxodon", "Thrinaxodon", "Thrinaxodon"],
  ["Morganucodon", "Morganucodon", "Morganucodon"],
  ["Repenomamus", "Repenomamus", "Repenomamus"],
  ["Darwinius", "Darwinius", "Darwinius"],
  ["Proconsul", "Proconsul (mammal)", "Proconsul"],
  ["Sivapithecus", "Sivapithecus", "Sivapithecus"],
  ["Pulmonoscorpius", "Pulmonoscorpius", "Pulmonoscorpius"],
  ["Cameroceras", "Cameroceras", "Cameroceras"],
  ["Cooksonia", "Cooksonia", "Cooksonia"],
  ["Archaeopteris", "Archaeopteris", "Archaeopteris"],
  ["Lepidodendron", "Lepidodendron", "Lepidodendron"],
  ["Glossopteris", "Glossopteris", "Glossopteris"],
];

const COUNTRY: Record<string, string> = {
  US: "the United States", CA: "Canada", MX: "Mexico", AR: "Argentina", BR: "Brazil", CL: "Chile", PE: "Peru", BO: "Bolivia", CO: "Colombia", VE: "Venezuela", UY: "Uruguay",
  GB: "the United Kingdom", UK: "the United Kingdom", DE: "Germany", FR: "France", ES: "Spain", PT: "Portugal", IT: "Italy", CH: "Switzerland", AT: "Austria", BE: "Belgium", NL: "the Netherlands",
  PL: "Poland", CZ: "Czechia", SK: "Slovakia", HU: "Hungary", RO: "Romania", RU: "Russia", UA: "Ukraine", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", GL: "Greenland", IS: "Iceland",
  GR: "Greece", TR: "Turkey", IL: "Israel", EG: "Egypt", MA: "Morocco", DZ: "Algeria", TN: "Tunisia", LY: "Libya", NE: "Niger", ML: "Mali", TD: "Chad", ET: "Ethiopia", KE: "Kenya", TZ: "Tanzania", UG: "Uganda",
  ZA: "South Africa", NA: "Namibia", ZW: "Zimbabwe", ZM: "Zambia", MW: "Malawi", MZ: "Mozambique", MG: "Madagascar", MU: "Mauritius", CN: "China", MN: "Mongolia", JP: "Japan", KR: "South Korea",
  IN: "India", PK: "Pakistan", TH: "Thailand", LA: "Laos", MM: "Myanmar", ID: "Indonesia", MY: "Malaysia", PH: "the Philippines", AU: "Australia", NZ: "New Zealand", KZ: "Kazakhstan", UZ: "Uzbekistan",
  KG: "Kyrgyzstan", IR: "Iran", SA: "Saudi Arabia", GE: "Georgia", AM: "Armenia", AQ: "Antarctica", AA: "Antarctica", TA: "Antarctica", EE: "Estonia", LV: "Latvia", LT: "Lithuania", HR: "Croatia", RS: "Serbia", BG: "Bulgaria",
  SI: "Slovenia", BA: "Bosnia and Herzegovina", IE: "Ireland", LB: "Lebanon", JO: "Jordan", SY: "Syria", OM: "Oman", YE: "Yemen", AE: "the UAE", CU: "Cuba", JM: "Jamaica", DO: "the Dominican Republic", PA: "Panama",
  CR: "Costa Rica", NI: "Nicaragua", HN: "Honduras", GT: "Guatemala", EC: "Ecuador", PY: "Paraguay", TT: "Trinidad and Tobago", SV: "El Salvador", BS: "the Bahamas", VN: "Vietnam", KH: "Cambodia", NP: "Nepal", LK: "Sri Lanka",
  MZ_: "", MR: "Mauritania", SN: "Senegal", NG: "Nigeria", CM: "Cameroon", GA: "Gabon", CD: "the DR Congo", AO: "Angola", BW: "Botswana", LS: "Lesotho", SD: "Sudan", SO: "Somalia", ER: "Eritrea", DJ: "Djibouti",
};

function placeLabel(o: Occ): string {
  const country = COUNTRY[(o.cc2 ?? "").toUpperCase()] ?? o.cc2 ?? "";
  const region = (o.stp ?? "").trim();
  if (region && country && region.toLowerCase() !== country.toLowerCase()) return `${region}, ${country}`;
  return region || country || "an unnamed site";
}

export async function buildFossils(ctx: BuildContext): Promise<CachedPin[]> {
  const pins: CachedPin[] = [];
  const genera = ctx.limit ? GENERA.slice(0, Math.min(GENERA.length, Math.max(5, ctx.limit / 2))) : GENERA;
  const wiki = await summaries(genera.map((g) => g[1]));
  const p18 = await wikidataImages(genera.map((g) => g[1]));

  for (let gi = 0; gi < genera.length; gi++) {
    const [taxon, wpTitle, noun] = genera[gi]!;
    const summary = wiki.get(wpTitle);
    if (!summary || summary.missing || summary.extract.length < 60) {
      process.stderr.write(`  pbdb: no Wikipedia intro for ${wpTitle}\n`);
      continue;
    }
    const url = `https://paleobiodb.org/data1.2/occs/list.json?base_name=${encodeURIComponent(taxon)}&show=coords,loc,time&limit=400`;
    let occs: Occ[];
    try {
      occs = (await fetchJson<{ records: Occ[] }>(url, { maxAgeMs: 30 * 86_400_000 })).records ?? [];
    } catch (err) {
      process.stderr.write(`  pbdb: ${taxon} failed: ${(err as Error).message.slice(0, 100)}\n`);
      continue;
    }
    const valid = occs.filter((o) => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lng)) && o.oei);
    if (!valid.length) continue;

    // Group by country/state; the busiest localities are the classic dig sites.
    const groups = new Map<string, Occ[]>();
    for (const o of valid) {
      const key = `${o.cc2 ?? "?"}|${o.stp ?? ""}`;
      const g = groups.get(key);
      if (g) g.push(o);
      else groups.set(key, [o]);
    }
    const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
    const take = gi < 25 ? 3 : gi < 90 ? 2 : 1;
    const used: { lat: number; lng: number }[] = [];
    let made = 0;
    for (const group of ranked) {
      if (made >= take) break;
      // Representative occurrence: the one closest to the group's centroid.
      const cx = group.reduce((s, o) => s + Number(o.lng), 0) / group.length;
      const cy = group.reduce((s, o) => s + Number(o.lat), 0) / group.length;
      const rep = group.reduce((best, o) => {
        const d = (Number(o.lng) - cx) ** 2 + (Number(o.lat) - cy) ** 2;
        const bd = (Number(best.lng) - cx) ** 2 + (Number(best.lat) - cy) ** 2;
        return d < bd ? o : best;
      }, group[0]!);
      const lat = Number(rep.lat);
      const lng = Number(rep.lng);
      if (used.some((u) => Math.abs(u.lat - lat) < 3 && Math.abs(u.lng - lng) < 3)) continue;
      used.push({ lat, lng });

      const early = rep.eag ?? 0;
      const late = rep.lag ?? early;
      const mid = (early + late) / 2;
      const ageText = mid > 0 ? `about ${fmtMa(mid)} years ago` : "";
      const interval = (rep.oei ?? "").replace(/^(Early|Middle|Late) /, (m) => m.toLowerCase());
      const where = placeLabel(rep);
      const finds = group.length;
      // A skeleton photo beats the size-comparison chart most dinosaur articles lead with.
      const image = isPhotoUrl(summary.image) ? summary.image : p18.get(summary.title) ?? p18.get(wpTitle) ?? null;
      const lead = `${noun} fossils were dug up in ${where}${interval ? ` — ${interval}` : ""}${ageText ? `, ${ageText}` : ""}${finds > 1 ? ` (${finds} recorded finds)` : ""}.`;
      const body = fitSentences(cleanExtract(summary.extract), Math.max(60, 280 - lead.length - 1));
      const fact = body ? `${lead} ${body}` : lead;
      pins.push({
        id: `pbdb-${slugify(wpTitle)}-${slugify(where)}`,
        title: `${summary.title} · ${where.replace(/^the /, "")}`,
        category: "fossil",
        lat: round(lat),
        lng: round(lng),
        fact: fact.length > 280 ? `${fact.slice(0, 279)}…` : fact,
        story_url: summary.url,
        story_label: `Wikipedia: ${summary.title}`,
        source: "pbdb",
        added: ctx.today,
        continent: ctx.continentOf(lat, lng),
        credit: `${CREDIT.pbdb} · ${CREDIT.wikipedia}`,
        rank: round(Math.max(0.35, 0.9 - gi * 0.004), 3),
        ...(image ? { image_url: image } : {}),
      });
      made += 1;
    }
  }
  process.stderr.write(`  pbdb: ${pins.length} genus/locality pins\n`);

  // Famous fossil sites (lagerstätten & paleontological sites) from Wikidata.
  const rows = [
    ...(await sparql(classQuery({ classes: ["Q2122699"], minSitelinks: 3, limit: 200 }), "lagerstätten")),
    ...(await sparql(classQuery({ classes: ["Q9096832"], minSitelinks: 5, limit: 250 }), "paleontological sites")),
  ];
  const sites = await pinsFromWikidata({ ctx, rows, category: "fossil", idPrefix: "fossilsite", cap: 110 });
  return dedupeById([...sites, ...pins]);
}

