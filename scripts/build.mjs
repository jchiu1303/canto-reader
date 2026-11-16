#!/usr/bin/env node
/**
 * Vite multi-entry build for a Manifest V3 extension.
 * Each entry is bundled standalone (IIFE for content/pages, ESM for the service
 * worker) so no code is shared across bundles and nothing is loaded remotely.
 */
import { build } from 'vite';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const targets = [
  { entry: 'src/content.ts', format: 'iife', out: 'content.js' },
  { entry: 'src/background.ts', format: 'es', out: 'background.js' },
  { entry: 'src/popup.ts', format: 'iife', out: 'popup.js' },
  { entry: 'src/options.ts', format: 'iife', out: 'options.js' },
];

for (const t of targets) {
  await build({
    configFile: false,
    root: ROOT,
    publicDir: false,
    logLevel: 'error',
    build: {
      outDir: DIST,
      emptyOutDir: false,
      minify: true,
      target: 'es2022',
      lib: {
        entry: resolve(ROOT, t.entry),
        formats: [t.format],
        name: 'CantoReader',
        fileName: () => t.out,
      },
      rollupOptions: {
        output: { entryFileNames: t.out },
      },
    },
  });
  console.log(`built ${t.out} (${t.format})`);
}

// Static assets use a flat layout so manifest.json can reference them directly.
const staticFiles = [
  ['manifest.json', 'manifest.json'],
  ['src/content.css', 'content.css'],
  ['src/popup.html', 'popup.html'],
  ['src/options.html', 'options.html'],
];
for (const [from, to] of staticFiles) {
  cpSync(resolve(ROOT, from), resolve(DIST, to));
}

mkdirSync(resolve(DIST, 'data'), { recursive: true });
for (const f of ['index.tsv', 'variants.json', 'meta.json']) {
  cpSync(resolve(ROOT, 'public/data', f), resolve(DIST, 'data', f));
}

console.log('dist/ ready: load it unpacked via chrome://extensions');
