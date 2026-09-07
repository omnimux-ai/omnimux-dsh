import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { TEXT_MODEL_LABELS } from './labels.js'
import { AUDIO_MODEL_SPECS, IMAGE_MODEL_SPECS, VIDEO_MODEL_SPECS } from '../media/catalog.js'
import { buildModelCatalog } from './list.js'
import { parseHubConfig } from '../config.js'

const here = dirname(fileURLToPath(import.meta.url))

function assertNoHyphen(label, where) {
  assert.equal(typeof label, 'string', `${where} missing string label`)
  assert.doesNotMatch(label, /-/, `display label must not contain '-': ${where} → ${label}`)
}

describe('model display-label contract (#321)', () => {
  it('TEXT_MODEL_LABELS / media SPECS / modelCatalog labels forbid "-" ', () => {
    for (const [id, label] of Object.entries(TEXT_MODEL_LABELS)) assertNoHyphen(label, `TEXT_MODEL_LABELS.${id}`)
    for (const row of [...IMAGE_MODEL_SPECS, ...VIDEO_MODEL_SPECS, ...AUDIO_MODEL_SPECS]) {
      if (row.id === 'doubao-asr-bigmodel') {
        // #744 explicitly names Doubao-ASR; other display-label rules stay intact.
        assert.equal(row.label, '豆包语音识别大模型 (Doubao-ASR)')
      } else assertNoHyphen(row.label, `media:${row.id}`)
    }
    const catalog = buildModelCatalog({ text: parseHubConfig({}).text, media: parseHubConfig({}).media, env: {} })
    for (const kind of ['text', 'image', 'video', 'audio']) {
      for (const row of catalog[kind]) assertNoHyphen(row.label, `catalog.${kind}.${row.id}`)
    }
  })

  it('cordis.patch.yml llm-pi-ai model name fields forbid "-"', () => {
    const raw = readFileSync(join(here, '../../cordis.patch.yml'), 'utf8')
    // naive scan of indented "name:" under models list (skip package names with @)
    const names = [...raw.matchAll(/^\s+name:\s*(.+)\s*$/gm)].map((m) => m[1].trim().replace(/^['"]|['"]$/g, ''))
    const modelNames = names.filter((n) => n && !n.startsWith('@') && n !== 'omnimux')
    assert.ok(modelNames.length >= 5, 'expected model name entries')
    for (const name of modelNames) assertNoHyphen(name, `cordis.name`)
  })

  it('required Issue #321 renames are present', () => {
    assert.equal(TEXT_MODEL_LABELS['claude-opus-4-6'], 'Claude Opus 4.6')
    assert.equal(TEXT_MODEL_LABELS['deepseek-v4-flash-vision-exp'], 'DeepSeek V4 Flash')
    assert.equal(TEXT_MODEL_LABELS['gpt-5.5'], 'GPT 5.5')
  })
})
