import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const gate = readFileSync(join(here, 'RuntimeGuideGate.jsx'), 'utf8')
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

describe('first-run skip button', () => {
  it('hides the guide as soon as the official write is confirmed', () => {
    assert.match(gate, /const \[dismissed, setDismissed\] = useState\(false\)/)
    assert.match(gate, /setDismissed\(true\)/)
    assert.match(gate, /!guide\.visible \|\| dismissed/)
  })

  it('makes the whole skip row clickable', () => {
    assert.match(gate, /omnimux-runtime-guide-skip-button/)
    assert.match(styles, /\.omnimux-runtime-guide-skip-button \{[\s\S]*?width: 100%/)
    assert.match(styles, /\.omnimux-runtime-guide-skip-button:hover \{[\s\S]*?text-decoration: underline/)
  })
})
