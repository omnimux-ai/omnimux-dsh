import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { en, zh } from '../locales.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('workflow library local-tab placeholder', () => {
  it('exposes localTab copy in both dictionaries', () => {
    assert.equal(zh['projects.localTab'], '本地项目')
    assert.equal(en['projects.localTab'], 'Local Projects')
  })

  it('ProjectLibraryPage mounts a pressed 本地项目 FilterBar tab', () => {
    const source = readFileSync(join(here, 'ProjectLibraryPage.jsx'), 'utf8')
    assert.match(source, /projects\.localTab/)
    assert.match(source, /useState\('local'\)/)
    assert.match(source, /<Divider \/>/)
    assert.match(source, /<Tabs[\s\S]*?variant="underline"/)
  })
})
