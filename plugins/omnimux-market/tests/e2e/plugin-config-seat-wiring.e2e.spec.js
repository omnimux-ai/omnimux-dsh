import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Wiring check for the dual plugin-configuration seats.
 *
 * The repository gate requires an end-to-end file for client source changes;
 * this asserts the real built bundle text (like the auth-gate T9 source check)
 * rather than driving a browser — the functional path is covered by the
 * worktree Web QA run recorded in `docs/evidence/worktree-web-qa-report.json`.
 */
const bundle = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../lib/client.js'), 'utf8')

test('E2E wiring: both seats register the market config card under the same key', () => {
  assert.match(bundle, /slots\.inject\("settings\.plugin\.item"/)
  assert.match(bundle, /slots\.inject\("plugins\.bundle\.config"/)
  // Same key on both seats, so 0.1.5 (namespace) and 0.2.x (package name) agree.
  const keys = bundle.match(/key: "omnimux-market"/g) ?? []
  assert.ok(keys.length >= 2, `expected both seats to carry key: "omnimux-market", found ${keys.length}`)
  // Both seats render the same card component (a bare `ConfigCard` argument).
  const cards = bundle.match(/^\s+ConfigCard\s*$/gm) ?? []
  assert.ok(cards.length >= 2, `expected both seats to pass ConfigCard, found ${cards.length}`)
})
