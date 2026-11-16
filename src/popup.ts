/** Toolbar popup: toggle reading mode on the current tab, jump to saved words. */
import { getSaved } from './shared/runtime';

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const toggleBtn = document.getElementById('toggle') as HTMLButtonElement;
const savedBtn = document.getElementById('saved') as HTMLButtonElement;
const optionsBtn = document.getElementById('options') as HTMLButtonElement;

let enabled = false;

function paint(): void {
  statusEl.textContent = enabled
    ? 'Reading mode is ON on this page.'
    : 'Reading mode is OFF on this page.';
  toggleBtn.textContent = enabled ? 'Disable on this page' : 'Enable on this page';
}

async function currentTabId(): Promise<number | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

toggleBtn.addEventListener('click', () => {
  void (async () => {
    const tabId = await currentTabId();
    const r = await chrome.runtime.sendMessage({ type: 'toggle', tabId });
    enabled = Boolean((r as { enabled?: boolean } | undefined)?.enabled);
    paint();
  })();
});

savedBtn.addEventListener('click', () => { void chrome.runtime.openOptionsPage(); });
optionsBtn.addEventListener('click', () => { void chrome.runtime.openOptionsPage(); });

void (async () => {
  const words = await getSaved();
  savedBtn.textContent = `Saved words (${words.length})`;
  const tabId = await currentTabId();
  const r = await chrome.runtime.sendMessage({ type: 'status', tabId });
  enabled = Boolean((r as { enabled?: boolean } | undefined)?.enabled);
  paint();
})();
