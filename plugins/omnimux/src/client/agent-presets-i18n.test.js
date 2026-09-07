import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_PRESETS_I18N,
  TARGET_NAMESPACE,
  installAgentPresetsI18n,
  patchAgentPresetsLocaleDicts,
} from './agent-presets-i18n.js'

test('AGENT_PRESETS_I18N exports accurate specification texts for zh and en', () => {
  assert.equal(AGENT_PRESETS_I18N.zh.presetStandardName, 'OmniAgent')
  assert.equal(
    AGENT_PRESETS_I18N.zh.presetStandardDescription,
    'OmniMux 全能营销运营 Agent：专注 TikTok 内容自动化，覆盖账号运营管理、爆款文案、口播配音、视觉生图、视频分镜生成、BGM 配乐、剪辑成片与评论互动增长全链路。',
  )
  assert.equal(AGENT_PRESETS_I18N.zh.presetCordisName, '组建团队')
  assert.equal(
    AGENT_PRESETS_I18N.zh.presetCordisDescription,
    '组建与配置自定义 Agent 专家团队：具备标准模式的全部能力，并提供运行时检查、插件实验和团队预设创作指导。',
  )

  assert.equal(AGENT_PRESETS_I18N.en.presetStandardName, 'OmniAgent')
  assert.equal(
    AGENT_PRESETS_I18N.en.presetStandardDescription,
    'OmniMux all-in-one marketing & operations agent: end-to-end TikTok content automation, account operations, viral copy, voiceover, visual generation, video storyboards, BGM, editing, and comment engagement.',
  )
  assert.equal(AGENT_PRESETS_I18N.en.presetCordisName, 'Team Builder')
  assert.equal(
    AGENT_PRESETS_I18N.en.presetCordisDescription,
    'Build and configure custom agent teams with full runtime inspection, plugin experimentation, and preset authoring guidance.',
  )
})

test('patchAgentPresetsLocaleDicts immediately patches existing zh and en dictionaries', () => {
  const zhDict = {
    presetStandardName: 'Standard mode (raw)',
    presetStandardDescription: 'Standard description',
    presetCordisName: 'Creator mode',
    presetCordisDescription: 'Creator description',
  }
  const enDict = {
    presetStandardName: 'Standard mode',
    presetStandardDescription: 'Standard description',
    presetCordisName: 'Creator mode',
    presetCordisDescription: 'Creator description',
  }

  const localesMap = new Map([
    ['zh', zhDict],
    ['en', enDict],
  ])
  const dictsMap = new Map([[TARGET_NAMESPACE, localesMap]])

  let published = false
  const locale = {
    dicts: dictsMap,
    snapshot: { active: 'zh' },
    publish: () => {
      published = true
    },
  }

  const changed = patchAgentPresetsLocaleDicts(locale)
  assert.equal(changed, true)
  assert.equal(published, true)

  assert.equal(zhDict.presetStandardName, 'OmniAgent')
  assert.equal(
    zhDict.presetStandardDescription,
    'OmniMux 全能营销运营 Agent：专注 TikTok 内容自动化，覆盖账号运营管理、爆款文案、口播配音、视觉生图、视频分镜生成、BGM 配乐、剪辑成片与评论互动增长全链路。',
  )
  assert.equal(zhDict.presetCordisName, '组建团队')
  assert.equal(
    zhDict.presetCordisDescription,
    '组建与配置自定义 Agent 专家团队：具备标准模式的全部能力，并提供运行时检查、插件实验和团队预设创作指导。',
  )

  assert.equal(enDict.presetStandardName, 'OmniAgent')
  assert.equal(
    enDict.presetStandardDescription,
    'OmniMux all-in-one marketing & operations agent: end-to-end TikTok content automation, account operations, viral copy, voiceover, visual generation, video storyboards, BGM, editing, and comment engagement.',
  )
  assert.equal(enDict.presetCordisName, 'Team Builder')
  assert.equal(
    enDict.presetCordisDescription,
    'Build and configure custom agent teams with full runtime inspection, plugin experimentation, and preset authoring guidance.',
  )
})

test('patchAgentPresetsLocaleDicts handles region variants like zh-CN and en-US', () => {
  const zhCnDict = { presetStandardName: 'old', presetCordisName: 'old' }
  const enUsDict = { presetStandardName: 'old', presetCordisName: 'old' }

  const localesMap = new Map([
    ['zh-cn', zhCnDict],
    ['en-us', enUsDict],
  ])
  const dictsMap = new Map([[TARGET_NAMESPACE, localesMap]])
  const locale = { dicts: dictsMap }

  patchAgentPresetsLocaleDicts(locale)
  assert.equal(zhCnDict.presetStandardName, 'OmniAgent')
  assert.equal(zhCnDict.presetCordisName, '组建团队')
  assert.equal(enUsDict.presetStandardName, 'OmniAgent')
  assert.equal(enUsDict.presetCordisName, 'Team Builder')
})

test('installAgentPresetsI18n intercepts late register calls and applies patch immediately', () => {
  const dictsMap = new Map()
  let registerCalled = false

  const locale = {
    dicts: dictsMap,
    register: function (ns, pairs) {
      registerCalled = true
      let locs = dictsMap.get(ns)
      if (!locs) {
        locs = new Map()
        dictsMap.set(ns, locs)
      }
      for (const [k, v] of Object.entries(pairs)) {
        locs.set(k.toLowerCase(), { ...v })
      }
    },
  }

  const cleanup = installAgentPresetsI18n({ locale })

  // Simulate late registration by official ui-agent-preset
  const officialZh = {
    presetStandardName: '标准模式',
    presetStandardDescription: '功能完整的编码 Agent',
    presetCordisName: '创造模式',
    presetCordisDescription: '用于创建自定义 Agent preset',
  }
  const officialEn = {
    presetStandardName: 'Standard mode',
    presetStandardDescription: 'Full coding agent',
    presetCordisName: 'Creator mode',
    presetCordisDescription: 'Built for creating custom agent presets',
  }

  locale.register(TARGET_NAMESPACE, { zh: officialZh, en: officialEn })

  assert.equal(registerCalled, true)
  const locs = dictsMap.get(TARGET_NAMESPACE)
  assert.ok(locs)
  assert.equal(locs.get('zh').presetStandardName, 'OmniAgent')
  assert.equal(locs.get('zh').presetCordisName, '组建团队')
  assert.equal(locs.get('en').presetStandardName, 'OmniAgent')
  assert.equal(locs.get('en').presetCordisName, 'Team Builder')

  cleanup()
})

test('installAgentPresetsI18n defensive timer cleans up properly', async () => {
  const dictsMap = new Map()
  const locale = { dicts: dictsMap }
  let effectRan = false

  const cleanup = installAgentPresetsI18n({
    locale,
    effect: (fn) => {
      effectRan = true
      return fn()
    },
  })

  assert.equal(effectRan, true)

  // Simulate direct mutation after installation
  const locs = new Map([
    ['zh', { presetStandardName: 'stale' }],
    ['en', { presetStandardName: 'stale' }],
  ])
  dictsMap.set(TARGET_NAMESPACE, locs)

  // Wait for defensive interval
  await new Promise((resolve) => setTimeout(resolve, 250))

  assert.equal(locs.get('zh').presetStandardName, 'OmniAgent')
  assert.equal(locs.get('en').presetStandardName, 'OmniAgent')

  cleanup()
})

test('defensive handling when locale is missing or malformed', () => {
  assert.doesNotThrow(() => installAgentPresetsI18n())
  assert.doesNotThrow(() => installAgentPresetsI18n({}))
  assert.doesNotThrow(() => installAgentPresetsI18n({ locale: {} }))
  assert.doesNotThrow(() => patchAgentPresetsLocaleDicts(null))
  assert.doesNotThrow(() => patchAgentPresetsLocaleDicts({ dicts: new Map() }))
})
