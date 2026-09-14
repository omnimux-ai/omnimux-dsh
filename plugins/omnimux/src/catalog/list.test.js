import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseHubConfig } from '../config.js'
import { IMAGE_MODEL_SPECS, VIDEO_MODEL_SPECS, AUDIO_MODEL_SPECS } from '../media/catalog.js'
import { buildModelCatalog, fingerprintOf, resolveDefault } from './list.js'
import { sortCatalogRows } from './sort.js'
import { loadAll, resetContractCache, DEFAULT_SPECS_DIR } from './contract/load.js'

const here = dirname(fileURLToPath(import.meta.url))

function hub() {
  return parseHubConfig({})
}

describe('sortCatalogRows', () => {
  it('sorts by label with numeric collation and does not mutate input', () => {
    const rows = [
      { id: 'b', label: 'Seedance 2.0' },
      { id: 'a', label: 'Claude Opus 4.6' },
      { id: 'c', label: 'Seedance 10' },
    ]
    const snapshot = rows.map((row) => row.id)
    assert.deepEqual(sortCatalogRows(rows).map((row) => row.label), ['Claude Opus 4.6', 'Seedance 2.0', 'Seedance 10'])
    assert.deepEqual(rows.map((row) => row.id), snapshot)
    assert.deepEqual(sortCatalogRows([]), [])
    assert.deepEqual(sortCatalogRows(null), [])
  })
})

describe('buildModelCatalog (H2 contract projection)', () => {
  it('returns Catalog v1.1: models[] authority + listed-only four lists + defaults', () => {
    const catalog = buildModelCatalog({ text: hub().text, media: hub().media, env: {} })
    assert.equal(catalog.schemaVersion, '1.1')
    assert.equal(catalog.source, 'omnimux')
    assert.equal(typeof catalog.fingerprint, 'string')
    assert.equal(catalog.fingerprint.length, 16)
    assert.equal(typeof catalog.contractFingerprint, 'string')
    assert.equal(catalog.contractFingerprint.length, 16)

    // Authoritative flat list includes contracted models under disposition governance.
    assert.equal(catalog.models.length, 39)
    assert.equal(catalog.models.find((m) => m.id === 'whisper-1')?.disposition, 'draft')
    assert.equal(catalog.models.find((m) => m.id === 'grok-imagine-image-quality')?.disposition, 'draft')
    assert.equal(catalog.models.find((m) => m.id === 'kling-o3')?.disposition, 'canonical')
    assert.equal(catalog.models.find((m) => m.id === 'nano-banana-2')?.aliases?.includes('nanobanana-2'), true)
    // #1789: seedasr-auc is its own canonical row with no alias relation to doubao-asr-bigmodel.
    assert.equal(catalog.models.find((m) => m.id === 'seedasr-auc')?.disposition, 'canonical')
    // Strong form: an omitted field and an undeclared alias list must both read as [].
    assert.deepEqual(catalog.models.find((m) => m.id === 'seedasr-auc')?.aliases ?? [], [])
    assert.deepEqual(catalog.models.find((m) => m.id === 'doubao-asr-bigmodel')?.aliases ?? [], [])
    // #1751: the 12 withdrawn (disposition=unavailable) models have no YAML row and
    // therefore never reach the authoritative models[] at all.
    for (const gone of [
      'gpt-image-2', 'minimax-h3-max', 'minimax-h3-max-turbo', 'midjourney', 'midjourney-niji-7',
      'seedream-4.5', 'kling-o1', 'seedance2.5-stable-max-720p', 'omni_flash', 'kling-avatar',
      'veo-3.1', 'veo-3.1-fast',
    ]) {
      assert.equal(catalog.models.some((m) => m.id === gone), false, gone)
    }

    // four lists derive ONLY from listed ops' output.type
    assert.deepEqual(catalog.image.map((row) => row.id).sort(), ['gpt-image-2.5'])
    const imageRow = catalog.image.find((row) => row.id === 'gpt-image-2.5')
    assert.equal(imageRow.label, 'GPT Image 2.5')
    assert.equal(imageRow.subtitle, '1k-4k')
    // 2026-09-14 评审次要-2：上游明写不支持 `gpt-image-2-5` 拼写，该别名已撤销 —— 默认图片型号
    // 现在没有任何别名，YAML 里也不再声明 `aliases:`。
    assert.equal(catalog.models.find((row) => row.id === 'gpt-image-2.5').aliases, undefined)
    // #1751: grok image keeps its contract row (canonical) but declares no listed op,
    // so it leaves the image bucket while all four spellings stay aliases of the product ID.
    assert.deepEqual(catalog.models.find((row) => row.id === 'grok-imagine-image-2-0').aliases, [
      'grok-imagine-image-2', 'grok-imagine-image', 'grok-imagine-image-2.0',
    ])
    assert.equal(catalog.image.some((row) => row.id === 'grok-imagine-image-2-0'), false)
    assert.deepEqual(catalog.video.map((row) => row.id), [
      'grok-imagine-video-1-5',
      'minimax-h3',
      'seedance-2-0',
      'seedance-2-0-fast',
      'seedance-2-0-mini',
      'seedance-2-5',
      'wan-3.0',
    ])
    assert.deepEqual(catalog.audio.map((row) => row.id), ['seed-audio-1.0'])
    // Text bucket includes implementation-ready models without requiring live history.
    assert.deepEqual(catalog.text.map((row) => row.id), [
      'claude-opus-4-6',
      'claude-opus-5',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'gemini-3.1-pro-preview',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'glm-5.3',
      'gpt-5.5',
      'gpt-5.6-sol',
      'grok-4.6',
      'kimi-k3',
    ])

    // draft / canonical-without-listed-ops models never appear in any bucket
    for (const kind of ['text', 'image', 'video', 'audio']) {
      for (const forbidden of [
        'whisper-1', 'grok-imagine-image-quality', 'grok-imagine-image-2-0', 'gpt-4o-mini-tts', 'suno',
        'jina-reader-v1', 'kling-o3', 'kling-v2-6', 'kling-v3', 'kling-v3-motion-control',
      ]) {
        assert.equal(catalog[kind].some((row) => row.id === forbidden), false, `${kind}:${forbidden}`)
      }
    }
    // nanobanana: hyphen canonical only; the underscore and legacy spellings stay aliases
    // and never become separate models[] rows
    const nano = catalog.models.find((row) => row.id === 'nano-banana-2')
    assert.ok(nano, 'nano-banana-2 stays authoritative')
    assert.deepEqual(nano.aliases, ['nano_banana_2', 'nanobanana-2'])
    assert.equal(catalog.models.some((row) => row.id === 'nanobanana-2'), false)

    // Config defaults survive where listed, including synchronous speech.
    assert.equal(catalog.defaults.text, 'gemini-3.8-flash')
    assert.equal(catalog.defaults.image, 'gpt-image-2.5')
    assert.equal(catalog.defaults.video, 'seedance-2-0-fast')
    assert.equal(catalog.defaults.audio, 'seed-audio-1.0')
    assert.equal(catalog.defaultsByOperation.text_to_video, 'seedance-2-0-fast')
    assert.equal(catalog.defaultsByOperation.text_to_image, 'gpt-image-2.5')
    assert.equal(catalog.defaultsByOperation.chat, 'gemini-3.8-flash')

    assert.equal(catalog.text.length, 12)
  })

  it('forbids ASCII hyphen-minus in every catalog model label', () => {
    const catalog = buildModelCatalog({ text: hub().text, media: hub().media, env: {} })
    for (const kind of ['text', 'image', 'video', 'audio']) {
      for (const row of catalog[kind]) {
        assert.equal(typeof row.label, 'string', `${kind}/${row.id} missing label`)
        assert.doesNotMatch(row.label, /-/, `${kind} model label must not contain '-': ${row.id} → ${row.label}`)
      }
    }
  })

  it('lets env overlay defaults when the id is listed; ignores unlisted ids', () => {
    const h = hub()
    const catalog = buildModelCatalog({
      text: h.text,
      media: h.media,
      env: { OMNIMUX_VIDEO_MODEL: 'kling-o3', OMNIMUX_TEXT_DEFAULT_MODEL: 'gpt-5.5' },
    })
    // kling-o3 is canonical but declares no listed op → env overlay refused
    assert.equal(catalog.defaults.video, 'seedance-2-0-fast')
    // #530 PR-A: gpt-5.5#chat is listed → env overlay accepted
    assert.equal(catalog.defaults.text, 'gpt-5.5')
    // #1751: a withdrawn id is refused for the same reason
    const withdrawn = buildModelCatalog({
      text: h.text,
      media: h.media,
      env: { OMNIMUX_VIDEO_MODEL: 'kling-o1' },
    })
    assert.equal(withdrawn.defaults.video, 'seedance-2-0-fast')
  })

  it('ignores env / settings ids that are not in the list', () => {
    const h = hub()
    const catalog = buildModelCatalog({
      text: h.text,
      media: h.media,
      env: { OMNIMUX_VIDEO_MODEL: 'not-a-real-model' },
      settingsDefaults: { defaultTextModel: 'totally-fake' },
    })
    assert.equal(catalog.defaults.video, 'seedance-2-0-fast')
    // fake text id refused → fall back to listed config default
    assert.equal(catalog.defaults.text, 'gemini-3.8-flash')
  })

  it('prefers settings overlay over config when env is absent', () => {
    const h = hub()
    const catalog = buildModelCatalog({
      text: h.text,
      media: h.media,
      env: {},
      settingsDefaults: {
        defaultTextModel: 'gpt-5.5',
        defaultImageModel: 'grok-imagine-image',
        defaultAudioModel: 'gpt-4o-mini-tts',
      },
    })
    // settings beats the config text default while env is absent
    assert.equal(catalog.defaults.text, 'gpt-5.5')
    // grok-imagine-image normalizes to grok-imagine-image-2-0, which declares no listed
    // op → the image overlay is refused and the listed config default survives.
    assert.equal(catalog.defaults.image, 'gpt-image-2.5')
    // The TTS setting names no listed op either; the listed Seed Audio default survives.
    assert.equal(catalog.defaults.audio, 'seed-audio-1.0')
  })

  for (const model of ['grok-imagine-image-2', 'grok-imagine-image', 'grok-imagine-image-2-0', 'grok-imagine-image-2.0']) {
    it(`refuses an image default named by ${model} and keeps the listed default`, () => {
      for (const source of ['env', 'settings', 'config']) {
        const h = hub()
        if (source === 'config') h.media.providers.omnimux.models.image = model
        const opts = {
          text: h.text,
          media: h.media,
          env: source === 'env' ? { OMNIMUX_IMAGE_MODEL: model } : {},
          settingsDefaults: source === 'settings' ? { defaultImageModel: model } : {},
        }
        // Every spelling normalizes to grok-imagine-image-2-0, which declares no
        // listed op, so no source may move the image default off gpt-image-2.5.
        assert.equal(buildModelCatalog(opts).defaults.image, 'gpt-image-2.5', source)
        assert.equal(buildModelCatalog({ ...opts, gate: { media: { image: false } } }).defaults.image, '', source)
      }
    })
  }

  it('empties a media kind when the gate disables it', () => {
    const h = parseHubConfig({ gate: { media: { video: false } } })
    const catalog = buildModelCatalog({ text: h.text, media: h.media, gate: h.gate, env: {} })
    assert.deepEqual(catalog.video, [])
    assert.equal(catalog.defaults.video, '')
    assert.ok(catalog.image.length > 0)
  })

  it('text bucket lists PR-A verified models; gate cannot invent unlisted ids', () => {
    const h = parseHubConfig({ gate: { models: { textComplete: { 'grok-4.6': true } } } })
    const catalog = buildModelCatalog({ text: h.text, media: h.media, gate: h.gate, env: {} })
    // #530 PR-A listed text set is contract-driven, not gate-invented
    assert.ok(catalog.text.some((row) => row.id === 'grok-4.6'))
    assert.equal(catalog.text.length, 12)
    assert.equal(catalog.text.some((row) => row.id === 'whisper-1'), false)
  })

  it('fingerprint changes when the contract changes (limit/MIME/listed sensitivity)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omx-fp-'))
    for (const name of readdirSync(DEFAULT_SPECS_DIR)) {
      copyFileSync(join(DEFAULT_SPECS_DIR, name), join(dir, name))
    }
    resetContractCache()
    const baseIndex = loadAll(DEFAULT_SPECS_DIR, { useCache: false })
    const h = hub()
    const base = buildModelCatalog({ text: h.text, media: h.media, env: {}, contractIndex: baseIndex })

    writeFileSync(
      join(dir, 'image-models.yaml'),
      readFileSync(join(dir, 'image-models.yaml'), 'utf8').replace('maxSizeMb: 10', 'maxSizeMb: 12'),
    )
    const changedIndex = loadAll(dir, { useCache: false })
    assert.notEqual(changedIndex.contentFingerprint, baseIndex.contentFingerprint)
    const changed = buildModelCatalog({ text: h.text, media: h.media, env: {}, contractIndex: changedIndex })
    assert.notEqual(changed.fingerprint, base.fingerprint)
    assert.equal(changed.contractFingerprint, changedIndex.contentFingerprint)
  })

  it('fingerprintOf legacy two-arg overload stays deterministic', () => {
    const lists = { text: [{ id: 'a' }], image: [], video: [], audio: [] }
    const defaults = { text: 'a', image: '', video: '', audio: '' }
    assert.equal(fingerprintOf(lists, defaults), fingerprintOf(lists, defaults))
    assert.equal(fingerprintOf(lists, defaults).length, 16)
  })

  it('fail-closed: broken contract index throws instead of serving a silent catalog', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omx-broken-list-'))
    writeFileSync(join(dir, 'broken.yaml'), 'schemaVersion: "1.1"\nmodels: [unclosed\n')
    const broken = loadAll(dir, { useCache: false })
    const h = hub()
    assert.throws(
      () => buildModelCatalog({ text: h.text, media: h.media, env: {}, contractIndex: broken }),
      /parse failure/,
    )
  })
})

describe('media facade tables (derived from contracts)', () => {
  it('facade SPECS are the full contracted directory (listed or not)', () => {
    assert.equal(IMAGE_MODEL_SPECS.length, 9)
    assert.equal(VIDEO_MODEL_SPECS.length, 11)
    // #1789: seedasr-auc joins the audio directory as a contracted model (ASR, text output).
    assert.equal(AUDIO_MODEL_SPECS.length, 6)
  })
})

describe('resolveDefault', () => {
  it('walks env → settings → config → fallback', () => {
    const ids = new Set(['a', 'b'])
    assert.equal(resolveDefault({
      kind: 'text',
      ids,
      env: { OMNIMUX_TEXT_DEFAULT_MODEL: 'b' },
      settingsDefaults: { defaultTextModel: 'a' },
      configDefault: 'a',
      fallback: 'a',
    }), 'b')
    assert.equal(resolveDefault({
      kind: 'text',
      ids,
      env: {},
      settingsDefaults: { defaultTextModel: 'b' },
      configDefault: 'a',
      fallback: 'a',
    }), 'b')
    assert.equal(resolveDefault({
      kind: 'text',
      ids,
      env: { OMNIMUX_TEXT_DEFAULT_MODEL: 'missing' },
      settingsDefaults: { defaultTextModel: 'missing' },
      configDefault: 'a',
      fallback: 'b',
    }), 'a')
  })
})
