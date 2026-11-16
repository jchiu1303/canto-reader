import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildIndex, parseIndex, parseVariants, lookup, detectScript, formsFor, mergeEntries,
  type Entry,
} from '../src/shared/dictionary';
import { savedToCsv, type SavedWord } from '../src/shared/runtime';

const e = (t: string, s: string, j: string, p: string, ...g: string[]): Entry =>
  ({ t, s, j, p, g });

describe('buildIndex', () => {
  it('indexes both traditional and simplified headwords', () => {
    const idx = buildIndex([e('體', '体', 'tai2', 'ti3', 'body')]);
    expect(idx.byForm.get('體')).toHaveLength(1);
    expect(idx.byForm.get('体')).toHaveLength(1);
    expect(idx.maxLen).toBe(1);
  });

  it('tracks the longest headword length', () => {
    const idx = buildIndex([
      e('香', '香', 'hoeng1', 'xiang1', 'fragrant'),
      e('一世人', '一世人', 'jat1 sai3 jan4', 'yi1 shi4 ren2', 'a lifetime'),
    ]);
    expect(idx.maxLen).toBe(3);
  });
});

describe('parseIndex / parseVariants', () => {
  it('round-trips the TSV format', () => {
    const tsv = '體\tbody\ttai2\tti3\tbody\u001fentity\n香港\t香港\thoeng1 gong2\tXiang1 gang3\tHong Kong\n';
    const idx = parseIndex(tsv);
    expect(idx.byForm.get('體')?.[0].g).toEqual(['body', 'entity']);
    expect(idx.byForm.get('香港')?.[0].j).toBe('hoeng1 gong2');
  });

  it('handles empty gloss and reading columns', () => {
    const idx = parseIndex('甲\t甲\t\t\t\n');
    expect(idx.byForm.get('甲')?.[0].g).toEqual([]);
    expect(idx.byForm.get('甲')?.[0].j).toBe('');
  });

  it('parses variant maps with safe defaults', () => {
    expect(parseVariants('{}')).toEqual({ t2s: {}, s2t: {} });
    expect(parseVariants('{"s2t":{"体":"體"}}').s2t['体']).toBe('體');
  });
});

describe('lookup', () => {
  it('prefers the longest dictionary match', () => {
    const idx = buildIndex([
      e('香', '香', 'hoeng1', 'xiang1', 'fragrant'),
      e('香港', '香港', 'hoeng1 gong2', 'Xiang1 gang3', 'Hong Kong'),
      e('我', '我', 'ngo5', 'wo3', 'I'),
      e('愛', '爱', 'oi3', 'ai4', 'love'),
    ]);
    const matches = lookup('我愛香港', idx, { segmenter: null });
    expect(matches.map((m) => m.text)).toEqual(['我', '愛', '香港']);
    expect(matches[2].start).toBe(2);
    expect(matches[2].end).toBe(4);
  });

  it('skips non-Han text and keeps absolute offsets', () => {
    const idx = buildIndex([e('香港', '香港', 'hoeng1 gong2', 'Xiang1 gang3', 'Hong Kong')]);
    const matches = lookup('Go to 香港 today', idx, { segmenter: null });
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(6);
    expect('Go to 香港 today'.slice(matches[0].start, matches[0].end)).toBe('香港');
  });

  it('falls back through single characters for unknown sequences', () => {
    const idx = buildIndex([
      e('嘅', '嘅', 'ge3', 'kai3', 'possessive particle'),
      e('咗', '咗', 'zo2', 'zuo3', 'perfective particle'),
    ]);
    const matches = lookup('食咗嘅', idx, { segmenter: null });
    expect(matches.map((m) => m.text)).toEqual(['咗', '嘅']);
  });

  it('resolves a simplified headword to the traditional entry via variants', () => {
    const idx = buildIndex([e('體', '體', 'tai2', 'ti3', 'body')]);
    const variants = { t2s: { '體': '体' }, s2t: { '体': '體' } };
    const matches = lookup('体', idx, { segmenter: null, variants });
    expect(matches[0].text).toBe('体');
    expect(matches[0].entries[0].t).toBe('體');
  });

  it('still finds words when Intl.Segmenter drives the boundaries', () => {
    const idx = buildIndex([
      e('香港', '香港', 'hoeng1 gong2', 'Xiang1 gang3', 'Hong Kong'),
      e('人', '人', 'jan4', 'ren2', 'person'),
    ]);
    const matches = lookup('香港人', idx);
    expect(matches.map((m) => m.text)).toContain('香港');
    expect(matches.map((m) => m.text)).toContain('人');
  });
});

describe('mergeEntries / formsFor', () => {
  it('deduplicates readings and glosses across sources', () => {
    const merged = mergeEntries([
      e('嘅', '嘅', 'ge2,ge3', 'kai3', 'possessive'),
      e('嘅', '嘅', 'ge3', '', 'possessive', 'final particle'),
    ]);
    expect(merged.jyutping).toEqual(['ge2', 'ge3']);
    expect(merged.gloss).toEqual(['possessive', 'final particle']);
    expect(merged.pinyin).toEqual(['kai3']);
  });

  it('returns the headword in the page script with a cross-reference', () => {
    const merged = { trad: '體', simp: '体' };
    expect(formsFor(merged, 'traditional', '體')).toEqual({ primary: '體', alternate: '体' });
    expect(formsFor(merged, 'simplified', '体')).toEqual({ primary: '体', alternate: '體' });
  });
});

describe('detectScript', () => {
  it('honours an explicit lang hint', () => {
    expect(detectScript('', 'zh-HK')).toBe('traditional');
    expect(detectScript('', 'zh-Hant-TW')).toBe('traditional');
    expect(detectScript('', 'zh-CN')).toBe('simplified');
    expect(detectScript('', 'zh-Hans')).toBe('simplified');
  });

  it('falls back to script-specific character markers', () => {
    expect(detectScript('這是繁體字，還是簡體？')).toBe('traditional');
    expect(detectScript('这是简体字，还是繁体？')).toBe('simplified');
    expect(detectScript('这是简体字的国家，我们的学习机会很多')).toBe('simplified');
  });
});

describe('savedToCsv', () => {
  it('escapes quotes and emits Anki-friendly rows', () => {
    const w: SavedWord = {
      key: '體', word: '體', trad: '體', simp: '体', jyutping: 'tai2',
      pinyin: 'ti3', gloss: ['body', 'a "form"'], savedAt: 1,
    };
    const csv = savedToCsv([w]);
    expect(csv.split('\r\n')[0]).toBe('Word,Traditional,Simplified,Jyutping,Pinyin,Gloss');
    expect(csv).toContain('"body; a ""form"""');
  });
});

describe('generated dictionary index', () => {
  it('contains known Cantonese and Mandarin headwords with correct readings', () => {
    const tsv = readFileSync(resolve(process.cwd(), 'public/data/index.tsv'), 'utf8');
    const idx = parseIndex(tsv);
    expect(idx.byForm.size).toBeGreaterThan(100_000);

    const cases: Array<[string, string]> = [
      ['嘅', 'ge3'],
      ['咗', 'zo2'],
      ['哋', 'dei6'],
      ['唔', 'm4'],
      ['佢', 'keoi5'],
      ['冇', 'mou5'],
      ['一世人', 'jat1 sai3 jan4'],
      ['香港', 'hoeng1 gong2'],
      ['體', 'tai2'],
    ];
    for (const [word, jyutping] of cases) {
      const bucket = idx.byForm.get(word);
      expect(bucket, `missing headword ${word}`).toBeDefined();
      expect(
        bucket!.some((x) => x.j.split(',').includes(jyutping)),
        `${word} should have Jyutping ${jyutping}`,
      ).toBe(true);
      expect(bucket!.some((x) => x.g.length > 0), `${word} should have a gloss`).toBe(true);
    }
  });

  it('corrects the mislabeled pinyin slot on Cantonese-only characters', () => {
    const tsv = readFileSync(resolve(process.cwd(), 'public/data/index.tsv'), 'utf8');
    const idx = parseIndex(tsv);
    const ge = idx.byForm.get('嘅');
    expect(ge?.some((x) => x.p === 'kai3')).toBe(true);
    expect(ge?.every((x) => x.p !== 'ge3')).toBe(true);
  });
});
