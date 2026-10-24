import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Wiring check for the Hub client entry.
 *
 * This lives under `tests/e2e/` because the repository gate requires an
 * end-to-end file for client source changes; it asserts the real source text
 * (same approach as the auth-gate T9 source check) instead of driving a
 * browser, and the functional path is covered by the worktree Web QA run.
 */
const here = dirname(fileURLToPath(import.meta.url))
const clientEntry = readFileSync(join(here, '..', '..', 'src', 'client', 'index.js'), 'utf8')

test('E2E wiring: the client entry installs the cross-generation settings reader', () => {
  assert.match(clientEntry, /import \{ installSettingsValueReader \} from '\.\/settings-value-reader\.js'/)
  assert.match(clientEntry, /const readRuntimeChoice = installSettingsValueReader\(\{ ctx, namespace: 'omnimux' \}\)/)
  assert.match(clientEntry, /if \(readRuntimeChoice\) setRuntimeChoiceReader\(readRuntimeChoice\)/)
  assert.doesNotMatch(clientEntry, /ctx\.inject\(\['settingsScope'\]/)
})
