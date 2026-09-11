#!/usr/bin/env node
/**
 * scripts/verify-craft.mjs
 * Static verification script for Universal Craft Knowledge & Deterministic Linter.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const RULES_DIR = join(REPO_ROOT, 'packages', 'craft', 'rules');

const REQUIRED_RULES = [
  'anti-ai-slop.md',
  'typography.md',
  'typography-hierarchy.md',
  'color.md',
  'laws-of-ux.md',
  'state-coverage.md',
  'accessibility-baseline.md',
  'social-copy-discipline.md',
  'video-storyboard-craft.md',
];

console.log('==> [craft:verify] Verifying universal craft rules...');

if (!statSync(RULES_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[ERROR] Rules directory not found at ${RULES_DIR}`);
  process.exit(1);
}

const existingFiles = new Set(readdirSync(RULES_DIR));
const missing = REQUIRED_RULES.filter((name) => !existingFiles.has(name));

if (missing.length > 0) {
  console.error(`[ERROR] Missing required craft rules: ${missing.join(', ')}`);
  process.exit(1);
}

// Verify each rule is non-empty and has proper markdown header
for (const rule of REQUIRED_RULES) {
  const content = readFileSync(join(RULES_DIR, rule), 'utf8').trim();
  if (!content.startsWith('# ')) {
    console.error(`[ERROR] Rule ${rule} must start with a level-1 markdown heading ('# ')`);
    process.exit(1);
  }
  if (content.length < 100) {
    console.error(`[ERROR] Rule ${rule} content is suspiciously short (<100 chars)`);
    process.exit(1);
  }
}

console.log(`✓ Verified ${REQUIRED_RULES.length} core craft rule definitions.`);
console.log('==> [craft:verify] All craft verification gates passed.');
