import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const files = [
  'composer-compact.js',
  'session-guide/styles.js',
  'composer-quick-shortcuts/styles.js',
  'conversation-box.js',
]

test('右栏布局 CSS 不再全局匹配任意会话面板', () => {
  for (const file of files) {
    const source = readFileSync(resolve(here, file), 'utf8')
    assert.equal(
      source.includes(':has([data-sidebar-right-panel][data-sidebar-right-open]'),
      false,
      `${file} still contains an unscoped rightbar :has selector`,
    )
    assert.match(source, /data-omnimux-rightbar-open="true"/, `${file} must use the current-session mirror`)
  }
})
