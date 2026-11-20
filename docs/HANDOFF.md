# Handoff

All times HKT (UTC+08:00). Newest section first. This file is the source of truth
for resuming work. `docs/KANBAN_INBOX.md` is the work queue,
`docs/PROGRESS_LOG.md` is the append-only trail. The published spec is GitHub
issue #1.

## 2026-11-20: v1 MVP complete, verified, parked

### Where it stands

The first shippable version is built, tested, committed and pushed. It is a
Manifest V3 Chrome extension that stays inert until enabled on a tab, then shows
Jyutping, Pinyin, English glosses and offline TTS for hovered or selected Chinese
text, with a saved-word list and CSV export. Nothing is left half-written in the
tree. It has NOT been loaded in a real Chrome session yet: caret-to-word mapping,
popup positioning and TTS voice selection need a manual smoke test. The work is
parked deliberately, not blocked.

### Facts (measured 2026-11-20 17:10 HKT)

| Item | Value |
| --- | --- |
| Repo | `https://github.com/jchiu1303/canto-reader` (public) |
| Remote / branch | `origin/main`, tracking, 0 ahead / 0 behind |
| Commit | `647c6ff` ("Fix lookup compounds and dictionary data quality") |
| Commits | 2 (`647c6ff`, `2359fa3`), clean working tree, 0 unpushed |
| Tags | none |
| Spec | issue #1, label `ready-for-agent`, body 14,457 chars |
| Machine | single local macOS dev machine (macOS 27.0.1). No remote build host, no SSH target, nothing to reach. |
| Run/data dirs | `public/data/` committed generated index; `data/raw/` gitignored upstream downloads; `dist/` gitignored build output; `node_modules/` gitignored |
| Tests | `npx vitest run` = 2 files, 23 tests, all pass (443 ms) |
| Typecheck | `npx tsc --noEmit` exit 0 |
| Build | `node scripts/build.mjs` produces 11 files, 14 MB `dist/`, 4 standalone bundles with zero cross-bundle imports |
| Audit | `npm audit --audit-level=moderate` = found 0 vulnerabilities |
| Data | 179,947 entries; `index.tsv` 14 MB, `variants.json` 176 KB, `meta.json` 958 B |
| Deps (exact pins) | vite 8.3.8, typescript 7.0.2, vitest 5.1.0, @types/chrome 0.3.7, @types/node 26.6.6 |
| Git identity | repo-local `jchiu1303 <jchiu1303@users.noreply.github.com>`; the machine's global identity is a personal address and must not be used here |

### Rules now enforced (with proof)

- **No secrets or personal data in this public repo.** A PII/secret grep over
  source and docs returned NO MATCHES; no `.env*`, `*.pem`, `*.key`, `*.p12`,
  `*.crx` files exist. Reason: the owner asked for a public repo with "no keys,
  passwords, secrets, anything personal".
- **Anonymised commits.** `git log -1 --format` showed author and committer both
  `jchiu1303 <jchiu1303@users.noreply.github.com>`. A fresh clone does NOT inherit
  this repo-local config (see Gotchas).
- **GitHub-side hardening enabled.** `gh api repos/.../security_and_analysis`
  reports secret scanning, secret_scanning_push_protection and
  dependabot_security_updates all `enabled`.
- **Narrow extension permissions.** Manifest has
  `permissions: ["storage","activeTab","scripting"]`, `host_permissions: 0`,
  `content_scripts: 0`, no `key` field. The extension is inert until enabled per tab.
- **No script injection from pages.** `grep innerHTML src/` returns only two
  comment lines that forbid it; zero usages. All page-derived text uses
  `textContent`.
- **No network, no keys, no accounts.** Dictionary bundled offline; TTS is the
  Web Speech API; saved words in `chrome.storage.local`. No remote code, CDN,
  analytics or telemetry (MV3 also forbids remote code).
- **Code MIT, data CC BY-SA 4.0, separate works.** `LICENSE` + `DATA_LICENSES.md`
  carry attribution for CC-CEDICT (BY-SA 4.0), CC-Canto and Pleco readings
  (BY-SA 3.0), Unihan (Unicode License V3). words.hk is excluded: its
  Non-Commercial licence conflicts with a public repo and with share-alike.
- **Decisions locked during the grill.** Fresh MV3 + TypeScript + Vite build
  (no GPL-2.0 Zhongwen fork); offline bundled data; Cantonese-first with a
  Pinyin toggle; Traditional + Simplified auto-detected; on-demand `activeTab`;
  saved-words list with Anki-friendly CSV; one pure test seam; no `AGENTS.md`
  or `docs/agents/*` in the repo. Full spec: issue #1.
- **Dictionary longest-match is authoritative.** Found during the build, not a
  user decision: `Intl.Segmenter('zh',{granularity:'word'})` splits 我哋 into
  我 | 哋, so capping matches at its boundaries breaks Cantonese. Proven by
  `tests/sentences.test.ts`.

### Rebuild end to end (copy-paste)

```bash
git clone https://github.com/jchiu1303/canto-reader.git
cd canto-reader

# Re-apply the anonymised identity. A fresh clone inherits the machine's
# GLOBAL git config, which is NOT anonymised.
git config --local user.name  'jchiu1303'
git config --local user.email 'jchiu1303@users.noreply.github.com'

npm install
# Do NOT run build:data on a fresh clone: data/raw/ is gitignored, so the
# script would fail. public/data/index.tsv is already committed.
npm run verify          # typecheck + 23 vitest cases + Vite build -> dist/
npm run audit           # expect "found 0 vulnerabilities"

# Manual smoke test (the only step not automated):
#   chrome://extensions -> Developer mode -> Load unpacked -> choose dist/
#   open a Traditional (HK) page and a Simplified page
#   click the toolbar icon or Alt+Shift+C, then hover a Chinese word
```

To refresh dictionary data later, populate `data/raw/` with the four upstream
downloads listed in `README.md` / `DATA_LICENSES.md`, then run
`npm run build:data && npm run verify`.

### Gotchas that cost time

- **A fresh clone loses the anonymised identity.** `git config --local` is not
  versioned. Re-run the two `git config --local` commands above before any
  commit, or the machine's global personal email is published in a public commit.
- **`npm run build:data` fails on a fresh clone.** It needs gitignored
  `data/raw/`. Skip it; `public/data/` is committed. `dist/` is also gitignored,
  so `npm run build` is required before load-unpacked.
- **CC-Canto trailing comments.** ~8,883 lines end in `# adapted from
  cc-cedict`. A regex ending `\/(.*)\/\s*$` silently dropped them and removed
  Jyutping for 嘅/咗/etc. The parser allows an optional `#.*` suffix;
  `skippedLines` in `public/data/meta.json` is 1.
- **Gloss ordering.** Prepending a batch of glosses with per-item `unshift()`
  reverses them; prepend the whole batch at once.
- **Slash inside a sense.** A bare `/` separates senses, but ` / ` is
  punctuation inside one sense; protect it before splitting.
- **CC-CEDICT mislabels Cantonese-only characters.** It stores a Jyutping reading
  in the pinyin slot (嘅 `[ge3]`, Mandarin is `kǎi`). Unihan `kCantonese` /
  `kMandarin` fill gaps and correct these; `meta.json` counts 5,429 fills and
  328 corrections.
- **`default_popup` suppresses `chrome.action.onClicked`.** The popup must send a
  message to the service worker; the keyboard command still works.
- **Service workers restart.** Do not keep enabled-tab state in memory; the
  worker probes the tab with `chrome.tabs.sendMessage` and treats a thrown
  "could not establish connection" as "not injected".
- **Content-script fetches need `web_accessible_resources`.** `data/index.tsv`,
  `variants.json` and `meta.json` are listed there; keep WAR to public data only.
- **Vite multi-entry.** Each bundle is built separately with `formats: ['iife']`
  (content/pages) or `['es']` (service worker). Do not add shared chunks or the
  IIFE bundles break.
- **Timestamp drift.** Work happened across 2026-11-17 to 2026-11-20 HKT; this
  handoff uses the machine clock shown above, not session-relative time.

### Open decisions

- **Manual Chrome smoke test.** The owner runs it (nothing needed from the agent
  first). Needed facts: does the hover caret map to the right word, does the popup
  position correctly near the viewport edge, and are `zh-HK` / `zh-CN` TTS voices
  actually present on this machine. The result decides whether `src/content.ts`
  needs a caret or position fix.
- **Hover tuning.** `hoverDelayMs` default 140 and the Alt modifier in
  `src/shared/runtime.ts` / `src/options.html` need real-usage feedback before
  changing. The owner decides after the smoke test.
- **v2 scope.** The owner picks among spaced repetition, Anki sync, example
  sentences, an optional separately-licensed words.hk data pack, and a sharded
  index to remove the ~14 MB per-tab parse. Needs the smoke-test result first.
- **Chrome Web Store publishing.** Out of scope for v1; needs the owner's
  explicit yes before any irreversible external publishing.
