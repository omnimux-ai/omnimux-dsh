/**
 * Injects and maintains localized copy for OmniMux built-in agent presets
 * in the official `settings.agentPreset` dictionary namespace.
 *
 * The official UI agent-preset plugin maps built-in preset IDs to:
 * - standard: `presetStandardName` / `presetStandardDescription`
 * - cordis: `presetCordisName` / `presetCordisDescription`
 * - daily-work: `presetDailyWorkName` / `presetDailyWorkDescription`
 *
 * This module ensures:
 * - `standard` renders as "代码开发" / "CodeDev"
 * - `daily-work` renders as "日常工作" / "WorkAssistant"
 * - `cordis` renders as "组建团队" / "Team Builder"
 */

export const AGENT_PRESETS_I18N = {
  zh: {
    presetStandardName: '代码开发',
    presetStandardDescription: '全功能代码开发与工程实现 Agent：支持架构设计、代码编写、Shell 命令执行、代码审查、测试验证与工作流。',
    presetDailyWorkName: '日常工作',
    presetDailyWorkDescription: '通用日常办公与工作协同 Agent：专注待办排期、工作周报、文档与方案拟定、会议纪要提炼、信息搜集整理与综合事务闭环。',
    presetCordisName: '组建团队',
    presetCordisDescription: '组建与配置自定义 Agent 专家团队：具备标准模式的全部能力，并提供运行时检查、插件实验和团队预设创作指导。',
    dailyWorkName: '日常工作',
    dailyWorkDescription: '通用日常办公与工作协同 Agent：专注待办排期、工作周报、文档与方案拟定、会议纪要提炼、信息搜集整理与综合事务闭环。',
  },
  en: {
    presetStandardName: 'CodeDev',
    presetStandardDescription: 'Full-featured code development and engineering agent: system architecture, code authoring, shell execution, code review, testing, and workflows.',
    presetDailyWorkName: 'WorkAssistant',
    presetDailyWorkDescription: 'General daily office and workflow assistant: task planning, status reports, document drafting, meeting summaries, web research, and operational follow-ups.',
    presetCordisName: 'Team Builder',
    presetCordisDescription: 'Build and configure custom agent teams with full runtime inspection, plugin experimentation, and preset authoring guidance.',
    dailyWorkName: 'WorkAssistant',
    dailyWorkDescription: 'General daily office and workflow assistant: task planning, status reports, document drafting, meeting summaries, web research, and operational follow-ups.',
  },
}

export const TARGET_NAMESPACE = 'settings.agentPreset'

/**
 * Resolves fallback display copy for a preset ID if not translated by the framework.
 * @param {string} presetId
 * @param {string} [locale='zh']
 * @returns {{ name: string, description: string } | null}
 */
export function getPresetFallbackCopy(presetId, locale = 'zh') {
  if (!presetId) return null
  const lang = String(locale).toLowerCase().startsWith('en') ? 'en' : 'zh'
  const dict = AGENT_PRESETS_I18N[lang]
  if (presetId === 'daily-work' || presetId === 'dailywork') {
    return {
      name: dict.presetDailyWorkName,
      description: dict.presetDailyWorkDescription,
    }
  }
  if (presetId === 'standard') {
    return {
      name: dict.presetStandardName,
      description: dict.presetStandardDescription,
    }
  }
  if (presetId === 'cordis') {
    return {
      name: dict.presetCordisName,
      description: dict.presetCordisDescription,
    }
  }
  return null
}

/**
 * Resolves localized preset display text with fallback support for custom/unrecognized presets like daily-work.
 * @param {{ id: string, name?: string, description?: string, trust?: string }} preset
 * @param {(key: string) => string} [t]
 * @param {string} [activeLocale='zh']
 * @returns {{ name: string, description?: string }}
 */
export function resolvePresetDisplayText(preset, t, activeLocale = 'zh') {
  if (!preset) return { name: '' }
  const lang = String(activeLocale).toLowerCase().startsWith('en') ? 'en' : 'zh'
  const dict = AGENT_PRESETS_I18N[lang]

  if (typeof t === 'function') {
    if (preset.id === 'standard') {
      return {
        name: t('presetStandardName') || dict.presetStandardName,
        description: t('presetStandardDescription') || dict.presetStandardDescription,
      }
    }
    if (preset.id === 'daily-work') {
      const translatedName = t('presetDailyWorkName')
      const translatedDesc = t('presetDailyWorkDescription')
      return {
        name: (translatedName && translatedName !== 'presetDailyWorkName') ? translatedName : dict.presetDailyWorkName,
        description: (translatedDesc && translatedDesc !== 'presetDailyWorkDescription') ? translatedDesc : dict.presetDailyWorkDescription,
      }
    }
    if (preset.id === 'cordis') {
      return {
        name: t('presetCordisName') || dict.presetCordisName,
        description: t('presetCordisDescription') || dict.presetCordisDescription,
      }
    }
  }

  const fallback = getPresetFallbackCopy(preset.id, activeLocale)
  if (fallback) {
    return {
      name: fallback.name,
      description: fallback.description,
    }
  }

  return {
    name: preset.name ?? preset.id,
    ...(preset.description === undefined ? {} : { description: preset.description }),
  }
}

/**
 * Patch existing locale dictionary maps for settings.agentPreset.
 * @param {any} locale
 * @returns {boolean} True if any value was patched.
 */
export function patchAgentPresetsLocaleDicts(locale) {
  if (!locale || !locale.dicts || typeof locale.dicts.get !== 'function') {
    return false
  }

  const locales = locale.dicts.get(TARGET_NAMESPACE)
  if (!locales || typeof locales.entries !== 'function') {
    return false
  }

  let changed = false

  for (const [lang, overrides] of Object.entries(AGENT_PRESETS_I18N)) {
    // 1. Update any existing entry that matches the language prefix (e.g. 'zh', 'zh-cn', 'en', 'en-us')
    for (const [localeKey, dict] of locales.entries()) {
      if (typeof localeKey !== 'string' || !dict || typeof dict !== 'object') continue
      const lower = localeKey.toLowerCase()
      if (lower === lang || lower.startsWith(`${lang}-`)) {
        for (const [key, val] of Object.entries(overrides)) {
          if (dict[key] !== val) {
            dict[key] = val
            changed = true
          }
        }
      }
    }

    // 2. Ensure base language entry exists in the locales map
    const baseDict = locales.get(lang)
    if (baseDict && typeof baseDict === 'object') {
      for (const [key, val] of Object.entries(overrides)) {
        if (baseDict[key] !== val) {
          baseDict[key] = val
          changed = true
        }
      }
    }
  }

  if (changed) {
    try {
      if (typeof locale.publish === 'function') {
        locale.publish(locale.snapshot?.active, false)
      }
    } catch {
      // Defensive ignore
    }
  }

  return changed
}

/**
 * Install the i18n patch onto the given Cordis context.
 * Uses immediate application, `ctx.locale.register` interception, periodic polling,
 * and lifecycle cleanup via `ctx.effect`.
 *
 * @param {{
 *   locale?: {
 *     dicts?: Map<string, Map<string, Record<string, string>>>,
 *     register?: (namespace: string, pairs: Record<string, any>) => any,
 *     publish?: Function,
 *     snapshot?: { active?: string },
 *   },
 *   effect?: (fn: () => (() => void) | void, desc?: string) => void,
 * }} ctx
 * @returns {() => void} Dispose function
 */
export function installAgentPresetsI18n(ctx) {
  if (!ctx || !ctx.locale) {
    return () => {}
  }

  const locale = ctx.locale
  let timer = null
  let disposed = false

  const apply = () => {
    if (disposed) return false
    return patchAgentPresetsLocaleDicts(locale)
  }

  // Hook ctx.locale.register defensively to catch synchronous / late registrations
  let originalRegister = null
  let patchedRegisterRef = null

  if (typeof locale.register === 'function') {
    originalRegister = locale.register
    patchedRegisterRef = function patchedRegister(namespace, pairs) {
      try {
        if (namespace === TARGET_NAMESPACE && pairs && typeof pairs === 'object') {
          for (const [lang, overrides] of Object.entries(AGENT_PRESETS_I18N)) {
            for (const [pairKey, pairDict] of Object.entries(pairs)) {
              const lower = String(pairKey).toLowerCase()
              if ((lower === lang || lower.startsWith(`${lang}-`)) && pairDict && typeof pairDict === 'object') {
                Object.assign(pairDict, overrides)
              }
            }
          }
        }
      } catch {
        // Defensive ignore
      }

      const res = originalRegister.apply(this, arguments)
      apply()
      return res
    }
    locale.register = patchedRegisterRef
  }

  // 1. Immediate try
  apply()

  // 2. Interval polling for safety against unintercepted dictionary writes
  if (typeof setInterval !== 'undefined') {
    timer = setInterval(apply, 200)
    if (timer && typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  const cleanup = () => {
    if (disposed) return
    disposed = true
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (originalRegister && locale.register === patchedRegisterRef) {
      locale.register = originalRegister
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => cleanup, 'omnimux: agent presets i18n cleanup')
  }

  return cleanup
}
