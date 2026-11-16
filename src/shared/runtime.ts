/** Browser-runtime helpers: local storage, CSV export, and offline TTS. */
export type Mode = 'cantonese' | 'mandarin';

export interface Settings {
  mode: Mode;
  requireAlt: boolean;
  hoverDelayMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'cantonese',
  requireAlt: false,
  hoverDelayMs: 140,
};

export interface SavedWord {
  key: string;
  word: string;
  trad: string;
  simp: string;
  jyutping: string;
  pinyin: string;
  gloss: string[];
  savedAt: number;
}

const KEY_SETTINGS = 'canto:settings';
const KEY_SAVED = 'canto:saved';

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY_SETTINGS);
  const stored = r[KEY_SETTINGS] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY_SETTINGS]: s });
}

export async function getSaved(): Promise<SavedWord[]> {
  const r = await chrome.storage.local.get(KEY_SAVED);
  return (r[KEY_SAVED] ?? []) as SavedWord[];
}

export async function saveWord(w: Omit<SavedWord, 'savedAt'>): Promise<SavedWord[]> {
  const all = await getSaved();
  if (all.some((x) => x.key === w.key)) return all;
  const next = [{ ...w, savedAt: Date.now() }, ...all];
  await chrome.storage.local.set({ [KEY_SAVED]: next });
  return next;
}

export async function removeSaved(key: string): Promise<SavedWord[]> {
  const next = (await getSaved()).filter((x) => x.key !== key);
  await chrome.storage.local.set({ [KEY_SAVED]: next });
  return next;
}

export function csvEscape(v: string): string {
  return '"' + v.replace(/"/g, '""') + '"';
}

/** Anki-friendly CSV: one row per saved word, quotes escaped. */
export function savedToCsv(words: SavedWord[]): string {
  const header = 'Word,Traditional,Simplified,Jyutping,Pinyin,Gloss';
  const rows = words.map((w) =>
    [w.word, w.trad, w.simp, w.jyutping, w.pinyin, w.gloss.join('; ')]
      .map(csvEscape).join(','),
  );
  return [header, ...rows].join('\r\n') + '\r\n';
}

/**
 * Speak a word. Voices are re-resolved on every call because Chrome can silently
 * revert a cached SpeechSynthesisVoice to an English default (known Chrome bug).
 * Returns false when the Web Speech API is unavailable.
 */
export function speak(text: string, lang: 'zh-HK' | 'zh-CN'): boolean {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
    return false;
  }
  const voices = speechSynthesis.getVoices();
  const norm = (v: string) => v.replace('_', '-').toLowerCase();
  const wanted = norm(lang);
  const voice = voices.find((v) => norm(v.lang).startsWith(wanted))
    ?? voices.find((v) => norm(v.lang).startsWith('zh'));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}
