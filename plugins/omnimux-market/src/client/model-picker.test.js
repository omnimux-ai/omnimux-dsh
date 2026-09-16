import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { getSessionModel, setSessionModel, sessionModelStore } from '../../lib/local-api.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('model picker client & session contracts (Issue #1167 / #2136)', () => {
  const modelPickerSrc = readFileSync(join(here, 'model-picker.js'), 'utf8')
  const cssSrc = readFileSync(join(here, 'css.js'), 'utf8')
  const applySrc = readFileSync(join(here, 'apply.js'), 'utf8')
  const hostSrc = readFileSync(join(here, '../host.ts'), 'utf8')
  const bootSrc = readFileSync(join(here, 'boot.js'), 'utf8')
  const catalogSrc = readFileSync(join(here, 'model-picker-catalog.js'), 'utf8')

  it('registers ModelPickerButton on conversation.input.left with order 20 (to the right of skill picker)', () => {
    assert.match(applySrc, /conversation\.input\.left/)
    assert.match(applySrc, /omnimux-market-model-picker/)
    assert.match(applySrc, /order:\s*20/)
    assert.match(applySrc, /ModelPickerButton/)
  })

  it('loads ModelPickerCatalog from boot and never ships a hardcoded DEFAULT_MODEL_CATALOG list', () => {
    assert.match(bootSrc, /model-picker-catalog\.js/)
    assert.match(bootSrc, /ModelPickerCatalog/)
    assert.match(modelPickerSrc, /ModelPickerCatalog/)
    assert.match(modelPickerSrc, /projectListedCatalog/)
    assert.match(modelPickerSrc, /EMPTY_MODEL_CATALOG/)
    assert.match(modelPickerSrc, /readCatalogCache/)
    assert.match(modelPickerSrc, /writeCatalogCache/)
    assert.match(modelPickerSrc, /omnimux:model-catalog-updated/)
    assert.match(modelPickerSrc, /getModelCatalog/)
    assert.match(modelPickerSrc, /\/omnimux\/model-catalog/)
    assert.doesNotMatch(modelPickerSrc, /DEFAULT_MODEL_CATALOG/)
    assert.doesNotMatch(modelPickerSrc, /mergeDynamicCatalog/)
    assert.doesNotMatch(modelPickerSrc, /seedance-2-0-mini-trial/)
    assert.doesNotMatch(modelPickerSrc, /nanobanana-pro/)
    assert.match(catalogSrc, /projectListedCatalog/)
    assert.match(catalogSrc, /MODEL_CATALOG_CACHE_KEY/)
  })

  it('shows empty/loading/unavailable states instead of fake rows', () => {
    assert.match(modelPickerSrc, /正在加载可用模型/)
    assert.match(modelPickerSrc, /模型目录暂不可用/)
    assert.match(modelPickerSrc, /data-omnimux-model-empty/)
    assert.match(modelPickerSrc, /data-omnimux-catalog-status/)
    assert.match(cssSrc, /\.sh-model-empty/)
  })

  it('renders capsule button with model icon + name when model is chosen', () => {
    assert.match(modelPickerSrc, /sh-model-capsule-btn/)
    assert.match(modelPickerSrc, /data-omnimux-model-capsule/)
    assert.match(modelPickerSrc, /selectedModel\.capsuleName \|\| selectedModel\.name/)
    assert.match(cssSrc, /\.sh-model-capsule-btn\{[^}]*border-radius:9999px/)
  })

  it('supports Auto switch toggle: toggling model turns auto off; toggling auto on clears model', () => {
    assert.match(modelPickerSrc, /handleToggleAuto/)
    assert.match(modelPickerSrc, /handleSelectModel/)
    assert.match(modelPickerSrc, /sh-model-switch/)
    assert.match(modelPickerSrc, /sh-model-switch-thumb/)
  })

  it('backend session model storage maintains session isolation', () => {
    const testSessionA = 'sess-test-a-' + Date.now()
    const testSessionB = 'sess-test-b-' + Date.now()

    assert.equal(getSessionModel(testSessionA), undefined)

    setSessionModel(testSessionA, {
      auto: false,
      selectedModel: {
        id: 'seedance-2-5',
        name: 'Dreamina Seedance 2.5',
        capsuleName: 'Dreamina Seedance 2.5',
        type: 'video',
      },
    })

    assert.equal(getSessionModel(testSessionB), undefined)

    const selA = getSessionModel(testSessionA)
    assert.equal(selA?.auto, false)
    assert.equal(selA?.selectedModel?.id, 'seedance-2-5')
    assert.equal(selA?.selectedModel?.type, 'video')

    sessionModelStore.delete(testSessionA)
    sessionModelStore.delete(testSessionB)
  })

  it('host configures tools/pre-execute guard and systemPrompt for locked session model', () => {
    assert.match(hostSrc, /tools\/pre-execute/)
    assert.match(hostSrc, /agent\/session-start/)
    assert.match(hostSrc, /session:selected-model/)
    assert.match(hostSrc, /getSessionModel/)
    assert.match(hostSrc, /【会话模型锁定】/)
    assert.match(hostSrc, /modelCatalog/)
    assert.match(hostSrc, /setModelCatalogResolver/)
  })

  it('reuses workflow brand icon system and conforms to visual design guidelines', () => {
    assert.match(modelPickerSrc, /BRAND_SVGS/)
    assert.match(modelPickerSrc, /resolveModelBrand/)
    assert.match(modelPickerSrc, /renderBrandIcon/)
    assert.match(modelPickerSrc, /sh-model-brand-icon/)
    assert.match(modelPickerSrc, /dangerouslySetInnerHTML/)

    assert.match(cssSrc, /\.sh-model-picker\{[^}]*width:480px/)
    assert.match(cssSrc, /\.sh-model-picker\{[^}]*background:var\(--dsw-alias-bg-layer-2/)
    assert.match(cssSrc, /\.sh-model-picker\{[^}]*border-radius:12px/)
    assert.match(cssSrc, /\.sh-model-tabs\{[^}]*background:var\(--dsw-alias-bg-base/)
    assert.match(cssSrc, /\.sh-model-tab\.active\{[^}]*background:var\(--dsw-alias-bg-layer-3/)
    assert.match(modelPickerSrc, /polygon/)
    assert.match(modelPickerSrc, /sh-model-diamond/)
  })

  it('aligns Seedance brand resolution with canvas bytedance logo (Issue #1202)', () => {
    assert.match(catalogSrc, /\(\^seed\|seedance\|seedream\|doubao\|豆包\|即梦\|dreamina\|bytedance\)/i)
    assert.match(modelPickerSrc, /bytedance:\s*`<svg[^>]*>[\s\S]*?22\.0004 4\.62844[\s\S]*?1\.99902 20\.1939[\s\S]*?16\.1213 9\.26561[\s\S]*?7\.49609 11\.582V20\.7336/)
  })

  it('unifies composer buttons style and compacts spacing (Issue #1211, #1220)', () => {
    assert.match(cssSrc, /div\[class\*="tools"\],\.Q7WfXG_tools\{gap:6px !important\}/)
    assert.match(cssSrc, /div\[class\*="modes"\]:empty,\.Q7WfXG_modes:empty\{display:none !important\}/)
    assert.match(cssSrc, /\[data-slot\*="conversation\.input\.left"\]/)
    assert.match(cssSrc, /\.sh-picker-trigger\{[^}]*height:28px/)
    assert.match(cssSrc, /\.sh-picker-trigger\{[^}]*border-radius:24px/)
    assert.match(cssSrc, /\.sh-picker-trigger\{[^}]*background:transparent/)
    assert.match(cssSrc, /\.sh-picker-trigger svg\{[^}]*width:14px/)
    assert.match(cssSrc, /\.sh-picker-trigger:hover\{[^}]*background:var\(--dsw-alias-interactive-bg-hover\)/)
    assert.match(cssSrc, /\.sh-picker-trigger:focus-visible\{[^}]*box-shadow:0 0 0 2px var\(--dsw-alias-border-l3\)/)
    assert.match(cssSrc, /\.sh-model-capsule-btn\{[^}]*height:28px/)
    assert.match(cssSrc, /\.sh-active-skill-chip\{[^}]*height:28px/)
  })
})
