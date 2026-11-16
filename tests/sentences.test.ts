import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseIndex, lookup, mergeEntries, formsFor } from '../src/shared/dictionary';

const idx = parseIndex(readFileSync(resolve(process.cwd(), 'public/data/index.tsv'), 'utf8'));
const wordsIn = (text: string) => lookup(text, idx).map((m) => m.text);
const entryFor = (word: string) => {
  const bucket = idx.byForm.get(word);
  if (!bucket) throw new Error(`missing ${word}`);
  return mergeEntries(bucket);
};

describe('full lookup pipeline on real sentences', () => {
  it('keeps colloquial Cantonese compounds together (ICU would split them)', () => {
    const words = wordsIn('我哋今日去咗香港食嘢');
    expect(words).toContain('我哋');           // ICU segments 我 | 哋
    expect(words).toContain('食嘢');
    expect(words).toContain('香港');
    expect(words).not.toContain('我');
    expect(entryFor('我哋').jyutping).toContain('ngo5 dei6');
  });

  it('resolves longer spoken-Cantonese phrases', () => {
    const words = wordsIn('佢哋嘅嘢唔見咗');
    expect(words).toContain('佢哋嘅');
    expect(words).toContain('唔見咗');
  });

  it('maps Simplified headwords to Traditional cross-references', () => {
    const words = wordsIn('我们今天去了香港吃饭');
    expect(words).toContain('我们');
    expect(words).toContain('吃饭');
    const we = lookup('我们', idx)[0];
    expect(formsFor(mergeEntries(we.entries), 'traditional', '我们').primary).toBe('我們');
    const eat = lookup('吃饭', idx)[0];
    expect(formsFor(mergeEntries(eat.entries), 'traditional', '吃饭').primary).toBe('吃飯');
  });

  it('shows Jyutping and Pinyin for a shared headword', () => {
    const hk = entryFor('香港');
    expect(hk.jyutping).toContain('hoeng1 gong2');
    expect(hk.pinyin.length).toBeGreaterThan(0);
    expect(hk.gloss[0]).toMatch(/Hong Kong/);
  });
});

describe('gloss quality for colloquial Cantonese characters', () => {
  it('puts the Cantonese-specific sense first', () => {
    const ye = entryFor('嘢').gloss;
    expect(ye[0]).toMatch(/Cantonese|\(Cant/i);
    expect(ye).toContain('thing');
    expect(entryFor('咗').gloss[0]).toMatch(/^Cantonese particle/);
    expect(entryFor('唔').gloss[0]).toMatch(/Cantonese|\(Cant/i);
    expect(entryFor('嘅').gloss[0]).toMatch(/Cant|possessive/i);
  });

  it('keeps a slash used as punctuation inside a single sense intact', () => {
    const gloss = entryFor('咗').gloss[0];
    expect(gloss).toContain('continuous state / completed actions');
    expect(gloss).not.toMatch(/^completed actions/);
  });
});
