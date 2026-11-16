/**
 * Pure dictionary logic: no DOM, no chrome.* APIs, no network.
 * This module is the single test seam for the extension.
 *
 * Index TSV (produced by scripts/build-index.mjs), one entry per line:
 *   t \t s \t j \t p \t g1<US>g2<US>...
 *   t = traditional headword, s = simplified headword,
 *   j = comma-separated Jyutping readings (polysemy),
 *   p = Mandarin pinyin with numbered tones,
 *   g = English glosses joined by U+001F.
 */
export interface Entry {
  t: string;
  s: string;
  j: string;
  p: string;
  g: string[];
}

export interface Match {
  start: number;
  end: number;
  text: string;
  entries: Entry[];
}

export interface DictIndex {
  byForm: Map<string, Entry[]>;
  maxLen: number;
}

export interface Variants {
  t2s: Record<string, string>;
  s2t: Record<string, string>;
}

export type Script = 'traditional' | 'simplified';

export const GLOSS_SEPARATOR = '\u001f';

const HAN_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

export function isHan(ch: string): boolean {
  return HAN_RE.test(ch);
}

export function buildIndex(entries: Entry[]): DictIndex {
  const byForm = new Map<string, Entry[]>();
  let maxLen = 1;
  for (const e of entries) {
    if (e.t.length > maxLen) maxLen = e.t.length;
    if (e.s.length > maxLen) maxLen = e.s.length;
    for (const form of new Set([e.t, e.s])) {
      if (!form) continue;
      const bucket = byForm.get(form);
      if (bucket) bucket.push(e);
      else byForm.set(form, [e]);
    }
  }
  return { byForm, maxLen };
}

export function parseIndex(tsv: string): DictIndex {
  const entries: Entry[] = [];
  for (const line of tsv.split('\n')) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 5) continue;
    entries.push({
      t: cols[0],
      s: cols[1],
      j: cols[2],
      p: cols[3],
      g: cols[4] ? cols[4].split(GLOSS_SEPARATOR).filter(Boolean) : [],
    });
  }
  return buildIndex(entries);
}

export function parseVariants(json: string): Variants {
  const parsed = JSON.parse(json) as Partial<Variants>;
  return { t2s: parsed.t2s ?? {}, s2t: parsed.s2t ?? {} };
}

export interface LookupOptions {
  /** null disables word segmentation (pure longest-match). Omitted uses Intl.Segmenter. */
  segmenter?: Intl.Segmenter | null;
  variants?: Variants | null;
}

function variantForms(form: string, v: Variants): string[] {
  const asTrad = [...form].map((c) => v.s2t[c] ?? c).join('');
  const asSimp = [...form].map((c) => v.t2s[c] ?? c).join('');
  const out: string[] = [];
  if (asTrad !== form) out.push(asTrad);
  if (asSimp !== form && asSimp !== asTrad) out.push(asSimp);
  return out;
}

/** Longest-match scan within [from, to). Appends matches with absolute offsets. */
function longestMatch(
  text: string,
  index: DictIndex,
  from: number,
  to: number,
  variants: Variants | null,
  out: Match[],
): void {
  let i = from;
  while (i < to) {
    if (!isHan(text[i])) { i++; continue; }
    const max = Math.min(index.maxLen, to - i);
    let hit: Entry[] | undefined;
    let len = 0;
    for (let L = max; L >= 1; L--) {
      const form = text.slice(i, i + L);
      const bucket = index.byForm.get(form);
      if (bucket && bucket.length > 0) { hit = bucket; len = L; break; }
      if (variants && L === 1) {
        for (const alt of variantForms(form, variants)) {
          const altBucket = index.byForm.get(alt);
          if (altBucket && altBucket.length > 0) { hit = altBucket; len = L; break; }
        }
        if (hit) break;
      }
    }
    if (hit) {
      out.push({ start: i, end: i + len, text: text.slice(i, i + len), entries: hit });
      i += len;
    } else {
      i++;
    }
  }
}

let cachedSegmenter: Intl.Segmenter | null | undefined;
function getSegmenter(): Intl.Segmenter | null {
  if (cachedSegmenter === undefined) {
    cachedSegmenter = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('zh', { granularity: 'word' })
      : null;
  }
  return cachedSegmenter;
}

/**
 * Return every dictionary match in `text`, with absolute offsets.
 * Intl.Segmenter constrains matches so a long headword cannot straddle a word
 * boundary; longest-match then resolves the headword inside each segment.
 */
export function lookup(text: string, index: DictIndex, opts: LookupOptions = {}): Match[] {
  const out: Match[] = [];
  const variants = opts.variants ?? null;
  const seg = opts.segmenter === undefined ? getSegmenter() : opts.segmenter;
  if (!seg) {
    longestMatch(text, index, 0, text.length, variants, out);
    return out;
  }
  for (const part of seg.segment(text)) {
    if (!part.isWordLike) continue;
    const from = part.index;
    const to = from + part.segment.length;
    let hasHan = false;
    for (let k = from; k < to; k++) {
      if (isHan(text[k])) { hasHan = true; break; }
    }
    if (!hasHan) continue;
    longestMatch(text, index, from, to, variants, out);
  }
  return out;
}

/** Merge all entries for one headword into display-friendly fields. */
export function mergeEntries(entries: Entry[]): {
  trad: string; simp: string; jyutping: string[]; pinyin: string[]; gloss: string[];
} {
  const trad = new Set<string>();
  const simp = new Set<string>();
  const jyutping = new Set<string>();
  const pinyin = new Set<string>();
  const gloss = new Set<string>();
  for (const e of entries) {
    if (e.t) trad.add(e.t);
    if (e.s) simp.add(e.s);
    for (const r of e.j.split(',')) { const v = r.trim(); if (v) jyutping.add(v); }
    if (e.p.trim()) pinyin.add(e.p.trim());
    for (const g of e.g) if (g) gloss.add(g);
  }
  return {
    trad: [...trad][0] ?? '',
    simp: [...simp][0] ?? '',
    jyutping: [...jyutping],
    pinyin: [...pinyin],
    gloss: [...gloss],
  };
}

// Characters that exist in only one of the two scripts.
const TRAD_ONLY = '體國這為會學東車馬書長門問間關興頭買實現電語說讀時對過還進個麼樣裡點無與專業產風臺';
const SIMP_ONLY = '体国这为会学东车马书长门问间关兴头买实现电语说读时对过还进个么样里点无与专业产风台';

/** Detect the script of a page. Prefer an explicit lang hint, then marker counts. */
export function detectScript(text: string, langHint = ''): Script {
  const hint = langHint.toLowerCase();
  if (hint.includes('hant') || /zh[_-](hk|tw|mo)\b/.test(hint)) return 'traditional';
  if (hint.includes('hans') || /zh[_-](cn|sg)\b/.test(hint)) return 'simplified';
  let trad = 0;
  let simp = 0;
  for (const ch of text) {
    if (TRAD_ONLY.includes(ch)) trad++;
    else if (SIMP_ONLY.includes(ch)) simp++;
    if (trad + simp >= 40) break;
  }
  return simp > trad ? 'simplified' : 'traditional';
}

/** The headword in the page's script, plus its cross-reference in the other script. */
export function formsFor(
  merged: { trad: string; simp: string },
  script: Script,
  fallback: string,
): { primary: string; alternate: string } {
  const primary = (script === 'traditional' ? merged.trad : merged.simp) || fallback;
  const other = (script === 'traditional' ? merged.simp : merged.trad) || '';
  return { primary, alternate: other && other !== primary ? other : '' };
}
