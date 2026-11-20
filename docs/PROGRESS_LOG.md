# Progress log

Append only, newest first.

## 2026-11-20 | v1 MVP built, verified, parked

- Built the full extension: offline dictionary index, hover/select popup,
  Jyutping + Pinyin, TTS, saved words, CSV export, settings, and on-demand
  `activeTab` injection.
- Measured: 23 vitest tests pass, `tsc --noEmit` exit 0, Vite build produces 11
  `dist/` files (14 MB), `npm audit` 0 vulnerabilities, PII/secret scan clean.
- Cost to learn: CC-Canto's trailing `#` comments dropped 8,883 lines;
  per-item `unshift()` reversed gloss order; ` / ` is punctuation inside a sense;
  Intl.Segmenter splits Cantonese compounds so dictionary longest-match had to
  become authoritative; CC-CEDICT stores Jyutping in the pinyin slot for
  Cantonese-only characters.
- Parked by request. Not done: real-Chrome smoke test.
