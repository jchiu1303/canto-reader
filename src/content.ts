/**
 * Injected content script, enabled on demand via activeTab.
 * Security rule: page-derived text is inserted with textContent only, never innerHTML.
 */
import {
  parseIndex, parseVariants, lookup, detectScript, formsFor, mergeEntries, isHan,
  type DictIndex, type Variants, type Match, type Script,
} from './shared/dictionary';
import {
  getSettings, setSettings, saveWord, speak, DEFAULT_SETTINGS, type Settings,
} from './shared/runtime';

const POPUP_ID = 'canto-reader-popup';
const WINDOW_CHARS = 32;

let index: DictIndex | null = null;
let variants: Variants | null = null;
let script: Script = 'traditional';
let settings: Settings = DEFAULT_SETTINGS;
let loading: Promise<void> | null = null;
let popupEl: HTMLDivElement | null = null;
let hoverTimer: number | null = null;
let pinned = false;
let disabled = false;

function ensureLoaded(): Promise<void> {
  if (index) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const [tsvRes, varRes] = await Promise.all([
        fetch(chrome.runtime.getURL('data/index.tsv')),
        fetch(chrome.runtime.getURL('data/variants.json')),
      ]);
      if (!tsvRes.ok || !varRes.ok) throw new Error('dictionary data unavailable');
      index = parseIndex(await tsvRes.text());
      variants = parseVariants(await varRes.text());
      try { settings = await getSettings(); } catch { settings = DEFAULT_SETTINGS; }
    })();
  }
  return loading;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function button(label: string, cls: string, onClick: (ev: MouseEvent) => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function ensurePopup(): HTMLDivElement {
  if (popupEl) return popupEl;
  const box = el('div');
  box.id = POPUP_ID;
  box.setAttribute('role', 'tooltip');
  document.body.appendChild(box);
  popupEl = box;
  return box;
}

function hide(): void {
  if (popupEl && !pinned) popupEl.style.display = 'none';
}

function position(box: HTMLDivElement, x: number, y: number): void {
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 10));
  const top = Math.max(8, Math.min(y + 18, window.innerHeight - h - 10));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

function readingLine(
  label: string, value: string, lang: 'zh-HK' | 'zh-CN', spoken: string, cls: string,
): HTMLDivElement {
  const line = el('div', 'cr-line');
  line.appendChild(el('span', 'cr-label', label));
  line.appendChild(el('span', `cr-value ${cls}`, value || '\u2014'));
  line.appendChild(button('\u{1F50A}', 'cr-btn cr-speak', (ev) => {
    ev.stopPropagation();
    speak(spoken, lang);
  }));
  return line;
}

function render(box: HTMLDivElement, match: Match, x: number, y: number): void {
  box.replaceChildren();
  const merged = mergeEntries(match.entries);
  const forms = formsFor(merged, script, match.text);
  const word = forms.primary;

  const top = el('div', 'cr-top');
  top.appendChild(el('strong', 'cr-word', word));
  if (forms.alternate) top.appendChild(el('span', 'cr-alt', forms.alternate));
  top.appendChild(button(pinned ? 'Unpin' : 'Pin', 'cr-btn cr-pin', (ev) => {
    ev.stopPropagation();
    pinned = !pinned;
    render(box, match, x, y);
  }));
  box.appendChild(top);

  const readings = el('div', 'cr-readings');
  const jy = readingLine('Jyutping', merged.jyutping.join(' / '), 'zh-HK', word, 'cr-jyutping');
  const py = readingLine('Pinyin', merged.pinyin.join(' / '), 'zh-CN', word, 'cr-pinyin');
  if (settings.mode === 'mandarin') {
    readings.appendChild(py);
    readings.appendChild(jy);
  } else {
    readings.appendChild(jy);
    readings.appendChild(py);
  }
  readings.appendChild(button(
    settings.mode === 'cantonese' ? 'Show Pinyin first' : 'Show Jyutping first',
    'cr-btn cr-mode',
    (ev) => {
      ev.stopPropagation();
      settings = { ...settings, mode: settings.mode === 'cantonese' ? 'mandarin' : 'cantonese' };
      void setSettings(settings);
      render(box, match, x, y);
    },
  ));
  box.appendChild(readings);

  const glossBox = el('div', 'cr-gloss');
  if (merged.gloss.length === 0) {
    glossBox.appendChild(el('div', 'cr-sense', 'No gloss available.'));
  } else {
    for (const g of merged.gloss.slice(0, 10)) glossBox.appendChild(el('div', 'cr-sense', g));
  }
  box.appendChild(glossBox);

  const save = button('Save word', 'cr-btn cr-save', (ev) => {
    ev.stopPropagation();
    void saveWord({
      key: word,
      word,
      trad: merged.trad,
      simp: merged.simp,
      jyutping: merged.jyutping.join(','),
      pinyin: merged.pinyin.join(','),
      gloss: merged.gloss,
    }).then(() => { save.textContent = 'Saved \u2713'; save.disabled = true; });
  });
  box.appendChild(save);

  box.style.display = 'block';
  position(box, x, y);
}

interface Caret { text: string; offset: number }

/** Map a viewport point to an absolute offset inside the containing element's text. */
function caretAt(x: number, y: number): Caret | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    node = range.startContainer;
    offset = range.startOffset;
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    return null;
  }
  if (!node) return null;
  let textNode: Text | null = null;
  if (node.nodeType === Node.TEXT_NODE) {
    textNode = node as Text;
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    textNode = walker.nextNode() as Text | null;
    offset = 0;
  }
  if (!textNode || !textNode.parentElement) return null;
  const parent = textNode.parentElement;
  let base = 0;
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  let cur: Node | null;
  while ((cur = walker.nextNode()) !== null) {
    if (cur === textNode) break;
    base += cur.textContent?.length ?? 0;
  }
  return { text: parent.textContent ?? '', offset: base + offset };
}

async function hover(x: number, y: number): Promise<void> {
  try { await ensureLoaded(); } catch { return; }
  const idx = index;
  if (disabled || pinned || !idx) return;
  const caret = caretAt(x, y);
  if (!caret) { hide(); return; }
  const from = Math.max(0, caret.offset - WINDOW_CHARS);
  const to = Math.min(caret.text.length, caret.offset + WINDOW_CHARS);
  const slice = caret.text.slice(from, to);
  const matches = lookup(slice, idx, { variants });
  const local = caret.offset - from;
  const hit = matches.find((m) => m.start <= local && local < m.end);
  if (!hit) { hide(); return; }
  script = detectScript(caret.text, document.documentElement.lang || '');
  render(ensurePopup(), hit, x, y);
}

function onMove(ev: MouseEvent): void {
  if (disabled || pinned) return;
  if (settings.requireAlt && !ev.altKey) { hide(); return; }
  if (popupEl && popupEl.contains(ev.target as Node)) return;
  if (hoverTimer !== null) window.clearTimeout(hoverTimer);
  const { clientX: x, clientY: y } = ev;
  hoverTimer = window.setTimeout(
    () => { void hover(x, y); },
    ev.altKey ? 0 : settings.hoverDelayMs,
  );
}

function onClick(ev: MouseEvent): void {
  if (disabled) return;
  if (popupEl && popupEl.contains(ev.target as Node)) return;
  if (pinned) { pinned = false; hide(); }
}

function onSelection(): void {
  if (disabled) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const text = sel.toString().trim();
  if (!text || text.length > 24 || ![...text].some(isHan)) return;
  void (async () => {
    try { await ensureLoaded(); } catch { return; }
    const idx = index;
    if (!idx || disabled) return;
    const matches = lookup(text, idx, { segmenter: null, variants });
    const entries = matches.flatMap((m) => m.entries);
    if (entries.length === 0) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const match: Match = { start: 0, end: text.length, text, entries };
    script = detectScript(text, document.documentElement.lang || '');
    render(ensurePopup(), match, rect.left, rect.bottom);
  })();
}

function teardown(): void {
  disabled = true;
  if (hoverTimer !== null) window.clearTimeout(hoverTimer);
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('mouseup', onSelection, true);
  popupEl?.remove();
  popupEl = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as { type?: string } | null;
  if (m?.type === 'probe') { sendResponse({ enabled: !disabled }); return false; }
  if (m?.type === 'disable') { teardown(); sendResponse({ enabled: false }); return false; }
  return false;
});

script = detectScript(
  document.body?.innerText?.slice(0, 4000) ?? '',
  document.documentElement.lang || '',
);

const preload = (): void => {
  void ensureLoaded().catch(() => { /* hover retries */ });
};
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(preload, { timeout: 2000 });
} else {
  window.setTimeout(preload, 400);
}

document.addEventListener('mousemove', onMove, true);
document.addEventListener('click', onClick, true);
document.addEventListener('mouseup', onSelection, true);
