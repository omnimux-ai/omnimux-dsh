#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVolcengineVoices } from '../../plugins/omnimux/src/catalog/voices/normalize.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = resolve(root, 'docs/assets/volcengine-voices.json');
const outputPath = resolve(root, 'plugins/omnimux/src/catalog/voices/volcengine-voice-index.json');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) throw new Error('Usage: node scripts/tools/normalize-volcengine-voices.mjs [--check]');
const voices = normalizeVolcengineVoices(JSON.parse(readFileSync(sourcePath, 'utf8')));
// One record per line keeps the generated diff reviewable and the asset compact.
const content = `[\n${voices.map((voice) => `  ${JSON.stringify(voice)}`).join(',\n')}\n]\n`;
if (args.includes('--check')) {
  if (readFileSync(outputPath, 'utf8') !== content) throw new Error('Voice index is stale; run node scripts/tools/normalize-volcengine-voices.mjs');
  console.log(`Verified ${voices.length} normalized Volcengine voices`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, 'utf8');
  console.log(`Generated ${voices.length} normalized Volcengine voices`);
}
