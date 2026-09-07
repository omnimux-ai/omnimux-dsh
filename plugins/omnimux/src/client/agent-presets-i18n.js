/**
 * Injects and maintains localized copy for OmniMux built-in agent presets
 * in the official `settings.agentPreset` dictionary namespace.
 *
 * The official UI agent-preset plugin maps built-in preset IDs to:
 * - standard: `presetStandardName` / `presetStandardDescription`
 * - cordis: `presetCordisName` / `presetCordisDescription`
 *
 * This module ensures `standard` renders as "通用Agent" / "GeneralAgent"
 * and `cordis` renders as "组建团队" / "Team Builder".
 */

export const AGENT_PRESETS_I18N = {
  zh: {
    presetStandardName: '通用Agent',
    presetStandardDescription: '全功能通用编码与智能协作 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。',
    presetCordisName: '组建团队',
    presetCordisDescription: '组建与配置自定义 Agent 专家团队：具备标准模式的全部能力，并提供运行时检查、插件实验和团队预设创作指导。',
  },
  en: {
    presetStandardName: 'GeneralAgent',
    presetStandardDescription: 'Full-featured general coding and collaboration agent with file editing, shell, file and web search, skills, plan, goal, subagent, and workflow capabilities.',
    presetCordisName: 'Team Builder',
    presetCordisDescription: 'Build and configure custom agent teams with full runtime inspection, plugin experimentation, and preset authoring guidance.',
  },
}

export const TARGET_NAMESPACE = 'settings.agentPreset'

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
