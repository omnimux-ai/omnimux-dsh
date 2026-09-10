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
 * - `cordis` renders as "创造模式" / "Creator Mode"
 */

export const AGENT_PRESETS_I18N = {
  zh: {
    presetStandardName: '代码开发',
    presetStandardDescription: '全栈架构设计、代码编写与工程交付。',
    presetDailyWorkName: '日常工作',
    presetDailyWorkDescription: '日常办公协同、文档拟定与事务闭环。',
    presetCordisName: '创造模式',
    presetCordisDescription: '插件实验开发、运行时检查与团队搭建。',
    dailyWorkName: '日常工作',
    dailyWorkDescription: '日常办公协同、文档拟定与事务闭环。',
  },
  en: {
    presetStandardName: 'CodeDev',
    presetStandardDescription: 'Full-stack architecture, coding, and engineering delivery.',
    presetDailyWorkName: 'WorkAssistant',
    presetDailyWorkDescription: 'Daily office collaboration, docs drafting, and task closure.',
    presetCordisName: 'Creator Mode',
    presetCordisDescription: 'Plugin development, runtime inspection, and team building.',
    dailyWorkName: 'WorkAssistant',
    dailyWorkDescription: 'Daily office collaboration, docs drafting, and task closure.',
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
  if (
    presetId === 'content-creation-team' ||
    presetId === 'content-creator-team' ||
    presetId === 'exp-ai-content-creator-team' ||
    presetId === '内容创作' ||
    presetId === '内容创作专家团'
  ) {
    return {
      name: lang === 'en' ? 'Content Creation' : '内容创作',
      description:
        lang === 'en'
          ? 'Multimodal creative planning, scripts, and video production.'
          : '多模态创意策划、脚本分镜与视听制作。',
    }
  }
  if (presetId === 'tiktok-agent' || presetId === 'tiktokagent' || presetId === '全能社媒操盘手') {
    return {
      name: lang === 'en' ? 'Social Media Lead' : '全能社媒操盘手',
      description:
        lang === 'en'
          ? 'Cross-platform social media creation and matrix growth.'
          : '全域社媒爆款创作与矩阵运营增长。',
    }
  }
  if (presetId === 'shopee-ops-expert') {
    return {
      name: lang === 'en' ? 'Shopee Ops Expert' : 'Shopee运营专家',
      description: lang === 'en' ? 'Shopee operation specialist for market, product, shop, brand and keyword analysis.' : '负责市场、产品、店铺、品牌和关键词分析的Shopee运营专员。',
    }
  }
  if (presetId === 'youtube-creator-expert') {
    return {
      name: lang === 'en' ? 'YouTube Creator Expert' : 'YouTube创作者专家',
      description: lang === 'en' ? 'Help merchants find and evaluate YouTube creators using Topview self-owned creator pool data.' : '帮助商家利用Topview自有创作者池数据寻找和评估YouTube创作者。',
    }
  }
  if (presetId === 'amazon-ops-expert') {
    return {
      name: lang === 'en' ? 'Amazon Ops Expert' : '亚马逊运营专家',
      description: lang === 'en' ? 'Amazon operation specialist for market, product, listing, keyword, review and risk analysis.' : '亚马逊市场、产品、列表、关键词、评论和风险分析运营专家。',
    }
  }
  if (presetId === 'tiktok-shop-ops-expert') {
    return {
      name: lang === 'en' ? 'TikTok Shop Ops Expert' : 'TikTok Shop运营专家',
      description: lang === 'en' ? 'TikTok Shop operation specialist for trends, products, materials, content, affiliates, ads and live ops.' : '负责TikTok Shop趋势、产品、素材、内容、联盟、广告和直播运营的专家。',
    }
  }
  if (presetId === 'media-creator') {
    return {
      name: lang === 'en' ? 'Media Creator' : '媒体创作者',
      description: lang === 'en' ? 'AI content generation: videos, images, digital avatars, background removal, TTS, and voice cloning using Topview AI.' : 'AI内容生成：使用Topview AI创意工具生成视频、图像、数字替身、背景移除、文本转语音和语音克隆。',
    }
  }
  if (presetId === 'html-generator') {
    return {
      name: lang === 'en' ? 'HTML Generator' : 'HTML生成器',
      description: lang === 'en' ? 'Generate beautiful HTML web pages based on data or descriptions, supporting data visualization and report presentation.' : '根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示。',
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
