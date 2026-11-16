# Dictionary data attribution

The extension's source code is MIT licensed (see `LICENSE`). The dictionary data
in `public/data/` is a **separate work**, distributed under
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.
It is a derivative of the sources below, aggregated and reformatted by
`scripts/build-index.mjs`.

You are free to share and adapt this data, including commercially, provided you
give appropriate credit, link the license, and distribute your contributions
under the same license.

## Sources

### CC-CEDICT
- What: Mandarin-Chinese to English dictionary, ~122k headwords (traditional +
  simplified forms, pinyin, English glosses).
- License: Creative Commons Attribution-ShareAlike 4.0 International
  <https://creativecommons.org/licenses/by-sa/4.0/>
- Source: <https://www.mdbg.net/chinese/dictionary?page=cc-cedict>
- Retrieved via the raw `cedict_ts.u8` mirror:
  <https://raw.githubusercontent.com/cschiller/zhongwen/main/data/cedict_ts.u8>
- Original CEDICT copyright (C) 1997, 1998 Paul Andrew Denisowski.

### CC-Canto
- What: Cantonese-English dictionary, Cantonese-specific headwords, Jyutping,
  and colloquial glosses. Version 2017-02-02.
- License: Creative Commons Attribution-Share Alike 3.0
  <https://creativecommons.org/licenses/by-sa/3.0/>
- Copyright (c) 2015-2017 Pleco Inc.
- Source and downloads: <https://cc-canto.org/>
- File: `cccanto-170202.zip` -> `cccanto-webdist.txt`

### CC-CEDICT Cantonese readings (Pleco)
- What: human-checked Jyutping readings for the CC-CEDICT lexicon.
  Version 2015-09-23.
- License: Creative Commons Attribution-Share Alike 3.0
  <https://creativecommons.org/licenses/by-sa/3.0/>
- Copyright (c) 2015 Pleco Software Incorporated.
- Source and downloads: <https://cc-canto.org/>
- File: `cccedict-canto-readings-150923.zip` -> `cccedict-canto-readings-150923.txt`

### Unihan (Unicode Character Database, Unicode 18.0)
- What: per-character `kCantonese` (Jyutping), `kMandarin` (pinyin),
  `kDefinition` (English gloss), `kSimplifiedVariant`, `kTraditionalVariant`.
  Used for character-level fallback and traditional/simplified conversion.
- License: Unicode License V3 (SPDX `Unicode-3.0`)
  <https://www.unicode.org/license.txt>
  <https://github.com/unicode-org/unihan-database/blob/main/LICENSE>
- Copyright (C) 1991-2026 Unicode, Inc.
- Source: <https://www.unicode.org/reports/tr38/>
  <https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip>

## Notes on the merged index

- CC BY-SA 3.0 material is compatible with relicensing the combined derivative
  under CC BY-SA 4.0.
- Unihan is permissive and its notice is retained here.
- `scripts/build-index.mjs` is the "source" of `public/data/index.tsv`. Raw
  downloads live in `data/raw/` (gitignored) and can be re-fetched from the URLs
  above. Running `npm run build:data` regenerates `index.tsv`, `variants.json`
  and `meta.json` deterministically from those sources.
- `words.hk` (粵典) is **not** bundled. Its Non-Commercial Open Data License is
  incompatible with a public repository and with the BY-SA share-alike terms of
  the merged index.
