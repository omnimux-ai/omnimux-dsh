import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const accountsClient = join(here, '../../../omnimux-accounts/src/client/index.js')
const accountsStage = join(here, '../../../omnimux-accounts/src/client/AccountsStage.jsx')

/**
 * @param {string} source
 * @returns {string[]}
 */
function sectionIds(source) {
  const ids = []
  const inject = /ctx\.slots\.inject\(\s*'settings\.section'[\s\S]*?id:\s*'([^']+)'/g
  for (const match of source.matchAll(inject)) ids.push(match[1])
  return ids
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function pluginsTabIds(source) {
  const ids = []
  const inject = /ctx\.slots\.inject\(\s*'settings\.plugins\.tab'[\s\S]*?id:\s*'([^']+)'/g
  for (const match of source.matchAll(inject)) ids.push(match[1])
  return ids
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function pluginItemKeys(source) {
  const keys = []
  const inject = /ctx\.slots\.inject\(\s*'settings\.plugin\.item'[\s\S]*?key:\s*'([^']+)'/g
  for (const match of source.matchAll(inject)) keys.push(match[1])
  return keys
}

describe('settings placement', () => {
  it('keeps only product chrome on the first-level Settings nav', () => {
    const hub = readFileSync(join(here, 'index.js'), 'utf8')
    assert.deepEqual(sectionIds(hub), ['omnimux-profile'])
    assert.deepEqual(pluginsTabIds(hub), ['omnimux-dsh-plugins'])
    assert.deepEqual(pluginItemKeys(hub), [])
    assert.doesNotMatch(hub, /ModelsSettingsCard|RuntimeGuideGate|omnimux-model-settings/)
    assert.ok(!hub.includes("settings.section', () =>") || sectionIds(hub).length === 1)
  })

  it('registers accounts as a pinned workbench tab, not a Settings seat', () => {
    const source = readFileSync(accountsClient, 'utf8')
    assert.deepEqual(sectionIds(source), [])
    assert.deepEqual(pluginsTabIds(source), [])
    assert.ok(!source.includes('settings.section'))
    assert.ok(!source.includes('settings.plugins.tab'))
    assert.match(source, /id:\s*ACCOUNTS_TAB_ID/)
    assert.match(source, /registerAccountsTab/)
    assert.ok(source.includes("mountSidebarEntry(null"), 'mounts its own pinned sidebar row')
  })

  it('AccountsStage is rendered as a workbench tab', () => {
    const source = readFileSync(accountsStage, 'utf8')
    assert.ok(!source.includes("'omnimux-app-open'"), 'no longer listens for the hub APP_OPEN_EVENT literal')
    assert.ok(!source.includes('WorkbenchFocusBar'), 'in-tab FocusBar removed; chat-toggle owns gui↔split')
    assert.ok(!/function claimProductStage|function readStageBox|PRODUCT_STAGE_CHROME/.test(source), 'does not duplicate the stage-claim protocol')
    assert.ok(!/import[^\n]*omnimux['"]/.test(source), 'must not import the hub package')
  })

  it('AccountsStage supports right panel store attachment and visibility', () => {
    const source = readFileSync(accountsStage, 'utf8')
    const section = readFileSync(join(here, '../../../omnimux-accounts/src/client/AccountsSection.jsx'), 'utf8')
    const hook = readFileSync(join(here, '../../../omnimux-accounts/src/client/use-accounts.js'), 'utf8')
    assert.ok(source.includes('attachStore'), 'attaches sidebar tab store')
    assert.ok(source.includes("data-visible={visible ? 'true' : 'false'}"), 'hides via data-visible')
    assert.ok(section.includes('active'), 'section receives tab visibility')
    assert.ok(hook.includes('sessionCache'), 'list hook rehydrates from a session cache')
  })
})
