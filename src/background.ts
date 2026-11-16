/** MV3 service worker: on-demand injection, status, and the keyboard toggle. */
import { DEFAULT_SETTINGS } from './shared/runtime';

const CONTENT_JS = 'content.js';
const CONTENT_CSS = 'content.css';
const SETTINGS_KEY = 'canto:settings';

interface ToggleMessage { type?: string; tabId?: number }

async function activeTabId(): Promise<number | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

async function isEnabled(tabId: number): Promise<boolean> {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'probe' });
    return Boolean((r as { enabled?: boolean } | undefined)?.enabled);
  } catch {
    return false; // no receiver -> content script not injected
  }
}

async function badge(tabId: number, on: boolean): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2e7d32' });
}

async function toggle(tabId: number): Promise<{ enabled: boolean }> {
  if (await isEnabled(tabId)) {
    await chrome.tabs.sendMessage(tabId, { type: 'disable' });
    await badge(tabId, false);
    return { enabled: false };
  }
  await chrome.scripting.insertCSS({ target: { tabId }, files: [CONTENT_CSS] });
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_JS] });
  await badge(tabId, true);
  return { enabled: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as ToggleMessage | null;
  if (m?.type !== 'toggle' && m?.type !== 'status') return false;
  void (async () => {
    const tabId = typeof m.tabId === 'number' ? m.tabId : await activeTabId();
    if (tabId === null) { sendResponse({ enabled: false }); return; }
    if (m.type === 'status') { sendResponse({ enabled: await isEnabled(tabId) }); return; }
    sendResponse(await toggle(tabId));
  })();
  return true; // response is asynchronous
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-reading') return;
  void (async () => {
    const tabId = await activeTabId();
    if (tabId !== null) await toggle(tabId);
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const r = await chrome.storage.local.get(SETTINGS_KEY);
    if (!r[SETTINGS_KEY]) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    }
  })();
});
