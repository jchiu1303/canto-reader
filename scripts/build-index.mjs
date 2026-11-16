#!/usr/bin/env node
/**
 * Merge the offline dictionary sources into one compact index.
 *
 * Inputs live in data/raw/ (gitignored, downloaded separately, see README):
 *   cedict_ts.u8                              CC-CEDICT, CC BY-SA 4.0
 *   extracted/cccanto-webdist.txt             CC-Canto, CC BY-SA 3.0
 *   extracted/cccedict-canto-readings-*.txt   Pleco Cantonese readings, CC BY-SA 3.0
 *   extracted/Unihan_Readings.txt             Unihan, Unicode License V3
 *   extracted/Unihan_Variants.txt             Unihan, Unicode License V3
 *
 * Output (committed, consumed at runtime):
 *   public/data/index.tsv       t \t s \t j \t p \t g1<US>g2...
 *   public/data/variants.json   single-character trad<->simp maps
 *   public/data/meta.json       source versions and entry counts
 *
 * The generated index is a derivative of the BY-SA sources and is distributed
 * under CC BY-SA 4.0. Extension code is MIT; the data is a separate work.
 * No network access and no credentials are used by this script.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');
const EX = resolve(RAW, 'extracted');
const OUT = resolve(ROOT, 'public/data');
const US = '\u001f';

mkdirSync(OUT, { recursive: true });

const dataLines = (p) =>
  readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith('#'));
const clean = (s) => s.replace(/[\t\r\n\u001f]/g, ' ').trim();
// A bare "/" separates senses; " / " is punctuation *inside* a sense
// (common in CC-Canto's adapted-from-CC-CEDICT lines).
const splitGlosses = (raw) => raw
  .replace(/ \/ /g, '\u001e')
  .split('/')
  .map((s) => clean(s).replace(/\u001e/g, ' / '))
  .filter(Boolean);

const RE_CEDICT = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;
// CC-Canto appends ` # adapted from cc-cedict` to ~8.9k lines; allow that comment.
const RE_CANTO = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\{([^}]*)\}\s+\/(.*)\/\s*(?:#.*)?\s*$/;
const RE_READING = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\{([^}]*)\}\s*$/;

const headwordKey = (t, s) => `${t}\u0000${s}`;
const isHanHeadword = (s) => /[\u3400-\u9fff\uf900-\ufaff]/.test(s);

/** @type {Map<string, {t:string,s:string,j:string,p:string,g:string[]}>} */
const entries = new Map();
const byTrad = new Map();
const bySimp = new Map();
let skipped = 0;

function put(e) {
  const k = headwordKey(e.t, e.s);
  entries.set(k, e);
  if (!byTrad.has(e.t)) byTrad.set(e.t, []);
  byTrad.get(e.t).push(e);
  if (!bySimp.has(e.s)) bySimp.set(e.s, []);
  bySimp.get(e.s).push(e);
}

function make(t, s, p, j, g) {
  return { t, s, p: p || '', j: j || '', g: g || [] };
}

/** Convert Unihan's tone-marked kMandarin (e.g. "kǎi") to CEDICT-style numbers ("kai3"). */
const TONE_VOWELS = {
  '\u0101': 'a1', '\u00e1': 'a2', '\u01ce': 'a3', '\u00e0': 'a4',
  '\u0113': 'e1', '\u00e9': 'e2', '\u011b': 'e3', '\u00e8': 'e4',
  '\u012b': 'i1', '\u00ed': 'i2', '\u01d0': 'i3', '\u00ec': 'i4',
  '\u014d': 'o1', '\u00f3': 'o2', '\u01d2': 'o3', '\u00f2': 'o4',
  '\u016b': 'u1', '\u00fa': 'u2', '\u01d4': 'u3', '\u00f9': 'u4',
  '\u01d6': 'v1', '\u01d8': 'v2', '\u01da': 'v3', '\u01dc': 'v4',
};
function numberedPinyin(raw) {
  const r = raw.trim().split(/\s+/)[0].normalize('NFC').split('').reduce(
    (acc, ch) => {
      const m = TONE_VOWELS[ch];
      if (m) { acc.tone = m.slice(-1); acc.out += m.slice(0, -1); }
      else acc.out += ch;
      return acc;
    }, { out: '', tone: '' }
  );
  return r.tone ? r.out + r.tone : r.out;
}

function mergeInto(e, { p, j, g, prepend }) {
  if (!e.p && p) e.p = p;
  if (j) {
    // A headword can carry several Jyutping readings (polysemy). Keep them all,
    // comma-separated; the first is the primary one shown in the popup.
    const readings = e.j ? e.j.split(',') : [];
    if (!readings.includes(j)) readings.push(j);
    e.j = readings.join(',');
  }
  if (g && g.length) {
    // Prepend the whole batch at once so CC-Canto's Cantonese senses keep their
    // original order (unshift() per item would reverse them).
    const fresh = g.filter((x) => !e.g.includes(x));
    if (prepend) e.g = [...fresh, ...e.g];
    else e.g.push(...fresh);
  }
}

/** Exact headword match, with a same-script fallback for version drift. */
function find(t, s) {
  const exact = entries.get(headwordKey(t, s));
  if (exact) return exact;
  return byTrad.get(t)?.[0] ?? bySimp.get(s)?.[0] ?? null;
}

// 1. CC-CEDICT: the base word list, traditional + simplified headwords.
for (const line of dataLines(resolve(RAW, 'cedict_ts.u8'))) {
  const m = RE_CEDICT.exec(line);
  if (!m) { skipped++; continue; }
  const [, t, s, p, glossRaw] = m;
  if (!isHanHeadword(t)) continue;
  put(make(t, s, p, '', splitGlosses(glossRaw)));
}
const cedictCount = entries.size;

// 2. Pleco's CC-CEDICT Cantonese readings: Jyutping for the whole lexicon.
for (const line of dataLines(resolve(EX, 'cccedict-canto-readings-150923.txt'))) {
  const m = RE_READING.exec(line);
  if (!m) { skipped++; continue; }
  const [, t, s, p, j] = m;
  const e = find(t, s);
  if (e) mergeInto(e, { p, j, g: [] });
  else put(make(t, s, p, j, []));
}
const afterReadings = entries.size;

// 3. CC-Canto: Cantonese-specific headwords and colloquial glosses take priority.
for (const line of dataLines(resolve(EX, 'cccanto-webdist.txt'))) {
  const m = RE_CANTO.exec(line);
  if (!m) { skipped++; continue; }
  const [, t, s, p, j, glossRaw] = m;
  const e = find(t, s);
  const payload = { p, j, g: splitGlosses(glossRaw), prepend: true };
  if (!e) put(make(t, s, p, j, payload.g));
  else mergeInto(e, payload);
}
const afterCanto = entries.size;

// 4. Unihan: character-level readings/definitions and trad<->simp variants.
const unihan = new Map();
const cp = (hex) => String.fromCodePoint(parseInt(hex, 16));
for (const line of dataLines(resolve(EX, 'Unihan_Readings.txt'))) {
  const parts = line.split('\t');
  if (parts.length < 3 || !parts[0].startsWith('U+')) continue;
  const ch = cp(parts[0].slice(2));
  if (!unihan.has(ch)) unihan.set(ch, {});
  const rec = unihan.get(ch);
  if (parts[1] === 'kCantonese') rec.j = parts[2].trim().split(/\s+/)[0];
  else if (parts[1] === 'kMandarin') rec.p = parts[2].trim().split(/\s+/)[0];
  else if (parts[1] === 'kDefinition') rec.g = clean(parts[2]);
}

const t2s = {};
const s2t = {};
for (const line of dataLines(resolve(EX, 'Unihan_Variants.txt'))) {
  const parts = line.split('\t');
  if (parts.length < 3 || !parts[0].startsWith('U+')) continue;
  const src = cp(parts[0].slice(2));
  const dstMatch = /U\+([0-9A-Fa-f]+)/.exec(parts[2]);
  if (!dstMatch) continue;
  const dst = cp(dstMatch[1]);
  if (parts[1] === 'kSimplifiedVariant') { t2s[src] = dst; s2t[dst] = src; }
  else if (parts[1] === 'kTraditionalVariant') { s2t[src] = dst; t2s[dst] = src; }
}

const singleCharForms = new Set();
for (const e of entries.values()) {
  if (e.t.length === 1) singleCharForms.add(e.t);
  if (e.s.length === 1) singleCharForms.add(e.s);
}
let unihanAdded = 0;
for (const [ch, rec] of unihan) {
  if (singleCharForms.has(ch)) continue;
  if (!rec.g && !rec.j && !rec.p) continue;
  // Rare characters have no meaningful trad/simp split; index the same form twice.
  put(make(ch, ch, rec.p ? numberedPinyin(rec.p) : '', rec.j ?? '', rec.g ? [rec.g] : []));
  unihanAdded++;
}

// 4b. Unihan has explicitly labelled kCantonese/kMandarin fields. Use them to
// fill missing Jyutping on single characters and to fix CC-CEDICT entries where
// a Cantonese-only character's pinyin slot actually holds a Jyutping reading
// (e.g. 嘅 is [ge3] in CC-CEDICT but Mandarin kǎi in Unihan).
let jyutpingFilled = 0;
let pinyinCorrected = 0;
for (const e of entries.values()) {
  const ch = e.t.length === 1 ? e.t : (e.s.length === 1 ? e.s : null);
  if (!ch) continue;
  const rec = unihan.get(ch);
  if (!rec) continue;
  const readings = e.j ? e.j.split(',') : [];
  if (rec.j && !readings.includes(rec.j)) {
    readings.unshift(rec.j);
    e.j = readings.join(',');
    jyutpingFilled++;
  }
  if (rec.p && readings.includes(e.p)) {
    e.p = numberedPinyin(rec.p);
    pinyinCorrected++;
  }
}

// 4c. For a Cantonese-reading tool, put Cantonese-specific senses first.
let glossReordered = 0;
for (const e of entries.values()) {
  const cant = e.g.filter((g) => /cantonese|\(cant\b/i.test(g));
  if (cant.length === 0 || cant.length === e.g.length) continue;
  const cantSet = new Set(cant);
  e.g = [...cant, ...e.g.filter((g) => !cantSet.has(g))];
  glossReordered++;
}

// 5. Emit.
const rows = [];
for (const e of entries.values()) {
  rows.push([e.t, e.s, e.j, e.p, e.g.join(US)].join('\t'));
}
writeFileSync(resolve(OUT, 'index.tsv'), rows.join('\n') + '\n', 'utf8');
writeFileSync(resolve(OUT, 'variants.json'), JSON.stringify({ t2s, s2t }) + '\n', 'utf8');

const meta = {
  format: 1,
  license: 'CC BY-SA 4.0 (see DATA_LICENSES.md)',
  sources: [
    { name: 'CC-CEDICT', license: 'CC BY-SA 4.0', url: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict' },
    { name: 'CC-Canto 2017-02-02', license: 'CC BY-SA 3.0', url: 'https://cc-canto.org/' },
    { name: 'CC-CEDICT Cantonese readings 2015-09-23 (Pleco)', license: 'CC BY-SA 3.0', url: 'https://cc-canto.org/' },
    { name: 'Unihan (Unicode 18.0)', license: 'Unicode License V3', url: 'https://www.unicode.org/reports/tr38/' },
  ],
  counts: {
    cedict: cedictCount,
    afterReadings,
    afterCanto,
    unihanCharactersAdded: unihanAdded,
    jyutpingFilledFromUnihan: jyutpingFilled,
    pinyinCorrectedFromUnihan: pinyinCorrected,
    glossReorderedCantoneseFirst: glossReordered,
    total: entries.size,
  },
  variantPairs: Object.keys(s2t).length,
  skippedLines: skipped,
};
writeFileSync(resolve(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(meta.counts, null, 2));
console.log(`variantPairs=${meta.variantPairs} skippedLines=${skipped}`);
