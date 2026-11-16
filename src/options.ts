/** Options page: settings, saved-word list, CSV export. DOM APIs only, no innerHTML. */
import {
  getSettings, setSettings, getSaved, removeSaved, savedToCsv, speak, type Settings,
} from './shared/runtime';

const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const modeCantonese = byId('mode-cantonese') as HTMLInputElement;
const modeMandarin = byId('mode-mandarin') as HTMLInputElement;
const requireAlt = byId('require-alt') as HTMLInputElement;
const hoverDelay = byId('hover-delay') as HTMLInputElement;
const tableBody = byId('saved-body') as HTMLTableSectionElement;
const countEl = byId('saved-count') as HTMLElement;
const exportBtn = byId('export') as HTMLButtonElement;
const clearBtn = byId('clear') as HTMLButtonElement;
const statusEl = byId('status') as HTMLElement;

let statusTimer: number | null = null;
function flash(msg: string): void {
  statusEl.textContent = msg;
  if (statusTimer !== null) window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => { statusEl.textContent = ''; }, 2500);
}

function renderSettings(s: Settings): void {
  modeCantonese.checked = s.mode === 'cantonese';
  modeMandarin.checked = s.mode === 'mandarin';
  requireAlt.checked = s.requireAlt;
  hoverDelay.value = String(s.hoverDelayMs);
}

async function renderWords(): Promise<void> {
  const words = await getSaved();
  tableBody.replaceChildren();
  countEl.textContent = `(${words.length})`;
  if (words.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No saved words yet. Hover a word on a page and click "Save word".';
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }
  for (const w of words) {
    const tr = document.createElement('tr');
    for (const value of [w.word, w.jyutping, w.pinyin, w.gloss.join('; ')]) {
      const td = document.createElement('td');
      td.textContent = value || '\u2014';
      tr.appendChild(td);
    }
    const hearTd = document.createElement('td');
    const hear = document.createElement('button');
    hear.type = 'button';
    hear.textContent = '\u{1F50A} \u7cb5 / \u666e';
    hear.title = 'Speak Cantonese / Mandarin';
    hear.addEventListener('click', () => { speak(w.word, 'zh-HK'); });
    hearTd.appendChild(hear);
    tr.appendChild(hearTd);

    const delTd = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      void removeSaved(w.key).then(() => renderWords());
    });
    delTd.appendChild(del);
    tr.appendChild(delTd);
    tableBody.appendChild(tr);
  }
}

async function persist(): Promise<void> {
  const s: Settings = {
    mode: modeMandarin.checked ? 'mandarin' : 'cantonese',
    requireAlt: requireAlt.checked,
    hoverDelayMs: Math.max(0, Math.min(1000, Number(hoverDelay.value) || 140)),
  };
  await setSettings(s);
  flash('Settings saved.');
}

for (const input of [modeCantonese, modeMandarin, requireAlt, hoverDelay]) {
  input.addEventListener('change', () => { void persist(); });
}

exportBtn.addEventListener('click', () => {
  void (async () => {
    const words = await getSaved();
    const blob = new Blob([savedToCsv(words)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canto-reader-words.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(`Exported ${words.length} word${words.length === 1 ? '' : 's'}.`);
  })();
});

clearBtn.addEventListener('click', () => {
  if (!window.confirm('Delete all saved words? This cannot be undone.')) return;
  void chrome.storage.local.set({ 'canto:saved': [] }).then(() => {
    void renderWords();
    flash('Saved words cleared.');
  });
});

void (async () => {
  renderSettings(await getSettings());
  await renderWords();
})();
