import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('omnimux-video client declares slots in inject', () => {
  const code = readFileSync(resolve(__dirname, 'index.js'), 'utf8')
  assert.match(code, /export\s+const\s+inject\s*=\s*\[[^\]]*'slots'[^\]]*\]/, 'inject must include slots')
  assert.match(code, /export\s+const\s+inject\s*=\s*\[[^\]]*'locale'[^\]]*\]/, 'inject must include locale')
})
