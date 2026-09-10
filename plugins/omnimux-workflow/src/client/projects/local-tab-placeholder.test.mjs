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

  it('mounts disabled 共创项目（即将上线） tab', () => {
    const source = readFileSync(join(here, 'ProjectLibraryPage.jsx'), 'utf8')
    assert.match(source, /id:\s*'featured'/)
    assert.match(source, /disabled:\s*true/)
    assert.equal(zh['workflow.tab.featured'], '共创项目（即将上线）')
    assert.equal(en['workflow.tab.featured'], 'Co-created Projects (Coming Soon)')
  })
})
