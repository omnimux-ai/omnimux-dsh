import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_PRESETS_I18N,
  TARGET_NAMESPACE,
  installAgentPresetsI18n,
  patchAgentPresetsLocaleDicts,
} from './agent-presets-i18n.js'

test('AGENT_PRESETS_I18N exports accurate specification texts for zh and en', () => {
  assert.equal(AGENT_PRESETS_I18N.zh.presetStandardName, '通用Agent')
  assert.equal(
    AGENT_PRESETS_I18N.zh.presetStandardDescription,
    '全功能通用编码与智能协作 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。',
  )
  assert.equal(AGENT_PRESETS_I18N.zh.presetCordisName, '组建团队')
  assert.equal(
    AGENT_PRESETS_I18N.zh.presetCordisDescription,
    '组建与配置自定义 Agent 专家团队：具备标准模式的全部能力，并提供运行时检查、插件实验和团队预设创作指导。',
  )

  assert.equal(AGENT_PRESETS_I18N.en.presetStandardName, 'GeneralAgent')
  assert.equal(
    AGENT_PRESETS_I18N.en.presetStandardDescription,
    'Full-featured general coding and collaboration agent with file editing, shell, file and web search, skills, plan, goal, subagent, and workflow capabilities.',
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

  assert.equal(zhDict.presetStandardName, '通用Agent')
  assert.equal(
    zhDict.presetStandardDescription,
    '全功能通用编码与智能协作 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。',
  )
  assert.equal(zhDict.presetCordisName, '组建团队')
  assert.equal(
    zhDict.presetCordisDescription,
    '组建与配置自定义 Agent 专家团队：具备标准模式的全部能力，并提供运行时检查、插件实验和团队预设创作指导。',
  )

  assert.equal(enDict.presetStandardName, 'GeneralAgent')
  assert.equal(
    enDict.presetStandardDescription,
    'Full-featured general coding and collaboration agent with file editing, shell, file and web search, skills, plan, goal, subagent, and workflow capabilities.',
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
  assert.equal(zhCnDict.presetStandardName, '通用Agent')
  assert.equal(zhCnDict.presetCordisName, '组建团队')
  assert.equal(enUsDict.presetStandardName, 'GeneralAgent')
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
  assert.equal(locs.get('zh').presetStandardName, '通用Agent')
  assert.equal(locs.get('zh').presetCordisName, '组建团队')
  assert.equal(locs.get('en').presetStandardName, 'GeneralAgent')
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

  assert.equal(locs.get('zh').presetStandardName, '通用Agent')
  assert.equal(locs.get('en').presetStandardName, 'GeneralAgent')

  cleanup()
})

test('defensive handling when locale is missing or malformed', () => {
  assert.doesNotThrow(() => installAgentPresetsI18n())
  assert.doesNotThrow(() => installAgentPresetsI18n({}))
  assert.doesNotThrow(() => installAgentPresetsI18n({ locale: {} }))
  assert.doesNotThrow(() => patchAgentPresetsLocaleDicts(null))
  assert.doesNotThrow(() => patchAgentPresetsLocaleDicts({ dicts: new Map() }))
})
