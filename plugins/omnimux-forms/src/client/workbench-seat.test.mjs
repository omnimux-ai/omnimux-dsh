import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('forms workbench seat (hidden from left sidebar)', () => {
  it('sidebar entry uses the workbench store and exports standard selectors', () => {
    const source = readFileSync(join(here, 'sidebar-entry.js'), 'utf8')
    assert.match(source, /createWorkbenchStageStore/)
    assert.match(source, /FORMS_TAB_ID = 'omnimux-forms:tasks'/)
    assert.match(source, /ENTRY_SELECTOR = '\[data-omnimux-forms-entry\]'/)
  })

  it('client apply keeps the tasks tab but does not mount the left sidebar row', () => {
    const source = readFileSync(join(here, 'index.js'), 'utf8')
    assert.doesNotMatch(source, /mountSidebarEntry\(/)
    assert.match(source, /id: FORMS_TAB_ID/)
    assert.match(source, /betterSidebar/)
  })
})
