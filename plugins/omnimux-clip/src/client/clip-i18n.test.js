import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const { translateZh, makeClipT } = await import(new URL('./i18n/translate.js', import.meta.url))
const { execSync } = await import('node:child_process')

const { zh } = await import(new URL('./i18n/zh-CN.js', import.meta.url))

test('zh dictionary entries all translate under zh and fall back under en', () => {
  const t = makeClipT('zh')
  for (const [src, expected] of Object.entries(zh)) {
    assert.equal(t(src), expected, `zh lookup for ${src}`)
  }
  const en = makeClipT('en')
  for (const src of Object.keys(zh)) {
    assert.equal(en(src), src, `en must pass through: ${src}`)
  }
})

test('missing keys fall back to source, never blank or key-echo', () => {
  const t = makeClipT('zh')
  assert.equal(t('Some untranslated thing'), 'Some untranslated thing')
  assert.equal(t(''), '')
  assert.equal(translateZh(123), 123)
  assert.equal(translateZh(undefined), undefined)
})

test('locale variants: zh / zh-CN / zh-Hans translate; others do not', () => {
  const probe = 'Export'
  assert.equal(makeClipT('zh')(probe), translateZh(probe))
  assert.equal(makeClipT({ active: 'zh-CN' })(probe), translateZh(probe))
  assert.equal(makeClipT({ active: 'zh_hans' })(probe), translateZh(probe))
  assert.equal(makeClipT('en-US')(probe), probe)
  assert.equal(makeClipT('ja')(probe), probe)
  assert.equal(makeClipT(undefined)(probe), translateZh(probe), 'absent locale defaults to zh like EMPTY_SNAPSHOT')
  assert.equal(makeClipT(null)(probe), translateZh(probe))
})

test('dictionary coverage for batch-1 surfaces (spot checks)', () => {
  const required = [
    'Export', 'Saved!', 'Undo', 'Redo', 'Video Editor', 'Motion Design',
    'Create Project', 'Start Fresh', 'Templates', 'Recent Projects',
    'Track Layers', 'Add track', 'Split at Playhead', 'Ripple Delete',
    'Mute track', 'Player', 'Aspect ratio', 'Playback quality',
    'Transform', 'Color', 'Effects', 'Speed', 'Style', 'No media imported',
    'Import Media', 'No selection',
  ]
  const missing = required.filter((k) => !(k in zh))
  assert.deepEqual(missing, [], `missing dictionary keys: ${missing.join(', ')}`)
})

test('every t("...") call in vendored openreel code resolves to a dictionary entry', () => {
  const root = new URL('./openreel/web/components/', import.meta.url).pathname
  const out = execSync(`grep -rhoE '\\bt\\("([^"]+)"\\)' "${root}" --include='*.tsx' --include='*.ts' || true`, { encoding: 'utf8' })
  const keys = [...new Set([...out.matchAll(/t\("([^"]+)"\)/g)].map((m) => m[1]))]
  const missing = keys.filter((k) => !(k in zh))
  assert.deepEqual(missing, [], `t() calls without dictionary entry: ${missing.join(', ')}`)
})

test('every zh dict file uses English-literal keys (no pinyin/keyed ids)', () => {
  for (const file of readdirSync(new URL('./i18n/zh/', import.meta.url))) {
    if (!file.endsWith('.js')) continue
    const text = readFileSync(new URL(`./i18n/zh/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /^\s*['"`][a-z0-9_]+[._:][a-z0-9_.:]+['"`]:/m, `${file} must key by English literal`)
  }
})
