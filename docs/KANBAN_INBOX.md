# Kanban

One line per item, verb first. `done` is the trail, keep it. Source of truth for
current state: `docs/HANDOFF.md`. Full spec: GitHub issue #1.

## now

- Run the Chrome load-unpacked smoke test on `dist/` (manual; command block in `docs/HANDOFF.md`).
- Record which `zh-HK` and `zh-CN` TTS voices are present on the machine.

## next

- Fix caret-to-word mapping or popup positioning if the smoke test finds it wrong (`src/content.ts`).
- Tune `hoverDelayMs` (default 140) and Alt behaviour from real usage (`src/shared/runtime.ts`, `src/options.html`).

## blocked

- Chrome Web Store packaging: needs the owner's explicit yes before irreversible publishing.
- v2 scope (SRS, Anki sync, words.hk data pack, sharded index): needs the owner's pick after the smoke test.

## done

- v1 MVP at `647c6ff`: 23 tests, typecheck, Vite build and `npm audit` all pass.
- Spec published to GitHub issue #1 with the `ready-for-agent` label.
- Public-repo hardening verified: no PII/secrets, anonymised commits, secret scanning + push protection + Dependabot enabled.
- Data pipeline bugs fixed: CC-Canto comments, gloss order, slash-in-sense, Intl.Segmenter compound splitting.
