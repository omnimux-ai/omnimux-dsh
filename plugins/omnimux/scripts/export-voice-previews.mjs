#!/usr/bin/env node
/**
 * Offline voice-preview snapshot exporter (Issue #3058, backend slice).
 *
 * Reads the same hub truth the Catalog serves — the volcengine voice index
 * plus the registered official-preview mapping — and emits a deterministic
 * JSON snapshot for the asset-catalog builder. No network, no dev-machine
 * paths, no TTS calls.
 *
 * Usage:
 *   node scripts/export-voice-previews.mjs            # snapshot → stdout
 *   node scripts/export-voice-previews.mjs --out FILE # write snapshot
 *   node scripts/export-voice-previews.mjs --check FILE  # exit 0 iff FILE
 *                                                   # is byte-identical
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildModelCatalog } from '../src/catalog/list.js';

const AUDIO_MODEL_ID = 'seed-audio-1.0';
const SNAPSHOT_SCHEMA_VERSION = 1;

export function buildVoicePreviewSnapshot() {
  // One load only: the catalog carries the same snapshot's raw mapping hash.
  // Mapping parse/audit validation happens inside buildModelCatalog (fail closed).
  const catalog = buildModelCatalog({ env: {} });
  const audio = catalog.audio.find((model) => model.id === AUDIO_MODEL_ID);
  if (!audio?.parameters?.voice?.options) {
    throw new Error(`audio model ${AUDIO_MODEL_ID} has no voice options`);
  }
  const voices = audio.parameters.voice.options.map((option) => {
    const { preview, ...meta } = structuredClone(option.meta);
    return { ...meta, preview };
  });
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    purpose: 'official-voice-preview',
    catalog_fingerprint: catalog.fingerprint,
    preview_fingerprint: catalog.preview_fingerprint,
    voices,
  };
}

function render(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function main(argv) {
  const outIdx = argv.indexOf('--out');
  const checkIdx = argv.indexOf('--check');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : null;
  const checkPath = checkIdx !== -1 ? argv[checkIdx + 1] : null;
  if ((outIdx !== -1 && !outPath) || (checkIdx !== -1 && !checkPath)) {
    console.error('usage: export-voice-previews.mjs [--out FILE | --check FILE]');
    process.exit(2);
  }
  const expected = render(buildVoicePreviewSnapshot());
  if (checkPath) {
    const actual = readFileSync(checkPath, 'utf8');
    if (actual !== expected) {
      console.error(`[export-voice-previews] snapshot drift: ${checkPath} is stale`);
      process.exit(1);
    }
    console.log(`[export-voice-previews] snapshot verified: ${checkPath}`);
    return;
  }
  if (outPath) {
    writeFileSync(outPath, expected);
    console.log(`[export-voice-previews] wrote ${outPath}`);
    return;
  }
  process.stdout.write(expected);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
