import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('products workbench seat (sidebar must not claim overlay)', () => {
  it('sidebar entry uses the workbench store, not the product stage', () => {
    const source = readFileSync(join(here, 'sidebar-entry.js'), 'utf8')
    assert.match(source, /createSidebarStore/)
    assert.match(source, /omnimux-products:library/)
    assert.doesNotMatch(source, /claimProductStage/)
  })

  it('client apply mounts the sidebar with a null product stage and registers tab', () => {
    const source = readFileSync(join(here, 'index.js'), 'utf8')
    assert.match(source, /mountSidebarEntry\(null, t, ctx\.locale\)/)
    assert.match(source, /id: PRODUCTS_TAB_ID/)
    assert.match(source, /registerProductsTab/)
    assert.doesNotMatch(source, /slots\.inject\('shell\.overlay'/)
  })

  it('stage component has no in-tab FocusBar and does not claim overlay', () => {
    const stage = readFileSync(join(here, 'ProductsStage.jsx'), 'utf8')
    assert.doesNotMatch(stage, /WorkbenchFocusBar/)
    assert.doesNotMatch(stage, /omnimux-workbench-focus/)
    assert.doesNotMatch(stage, /claimProductStage/)
  })

  it('stage ActionRow contains secondary "add in chat" button that reveals middle conversation column', () => {
    const stage = readFileSync(join(here, 'ProductsStage.jsx'), 'utf8')
    const locales = readFileSync(join(here, 'locales.js'), 'utf8')

    // Locales must define add.chatButton
    assert.match(locales, /'add\.chatButton':\s*'对话中添加'/)
    assert.match(locales, /'add\.chatButton':\s*'Add in Chat'/)

    // Button must exist in ActionRow with secondary variant and ChatIcon
    assert.match(stage, /variant="secondary"[\s\S]*?leadingIcon=\{<ChatIcon\s*\/>\}[\s\S]*?onClick=\{handleOpenConversation\}/)
    assert.match(stage, /t\('add\.chatButton'\)/)

    // handleOpenConversation uncollapses conversation and sets focus to split
    assert.match(stage, /api\.setConversationCollapsed\(false\)/)
    assert.match(stage, /api\.setFocus\('split'\)/)
  })
})

