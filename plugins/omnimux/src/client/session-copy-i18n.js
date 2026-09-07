/**
 * Injects and maintains localized copy for Session controls
 * ("新会话" -> "新对话") in official dictionaries (`sidebar`, `workspace`).
 *
 * Official defaults:
 * - sidebar: session.new: "新会话", session.new.label: "新建会话"
 * - workspace: session.new: "新会话", actions.newSession.aria: "在“{name}”中新建会话"
 *
 * This module ensures:
 * - sidebar: session.new -> "新对话", session.new.label -> "新对话"
 * - workspace: session.new -> "新对话", actions.newSession.aria -> "在“{name}”中新建对话"
 */

export const SESSION_COPY_OVERRIDES = {
  sidebar: {
    zh: {
      'session.new': '新对话',
      'session.new.label': '新对话',
    },
  },
  workspace: {
    zh: {
      'session.new': '新对话',
      'actions.newSession.aria': '在“{name}”中新建对话',
    },
  },
}

/**
 * Patch existing locale dictionary maps for session copy overrides.
 * @param {any} locale
 * @returns {boolean} True if any value was patched.
 */
export function patchSessionCopyLocaleDicts(locale) {
  if (!locale || !locale.dicts || typeof locale.dicts.get !== 'function') {
    return false
  }

  let changed = false

  for (const [namespace, langMap] of Object.entries(SESSION_COPY_OVERRIDES)) {
    const locales = locale.dicts.get(namespace)
    if (!locales || typeof locales.entries !== 'function') {
      continue
    }

    for (const [lang, overrides] of Object.entries(langMap)) {
      // 1. Update any existing matching entry (e.g. 'zh', 'zh-cn')
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
 * Install the Session copy i18n patch onto the given Cordis context.
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
export function installSessionCopyI18n(ctx) {
  if (!ctx || !ctx.locale) {
    return () => {}
  }

  const locale = ctx.locale
  let timer = null
  let disposed = false

  const apply = () => {
    if (disposed) return false
    return patchSessionCopyLocaleDicts(locale)
  }

  // Hook ctx.locale.register defensively to catch synchronous / late registrations
  let originalRegister = null
  let patchedRegisterRef = null

  if (typeof locale.register === 'function') {
    originalRegister = locale.register
    patchedRegisterRef = function patchedRegister(namespace, pairs) {
      try {
        const overridesForNs = SESSION_COPY_OVERRIDES[namespace]
        if (overridesForNs && pairs && typeof pairs === 'object') {
          for (const [lang, overrides] of Object.entries(overridesForNs)) {
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

  // 1. Immediate apply
  apply()

  // 2. Continuous retry polling for the first few seconds to cover async module loads
  let attempts = 0
  const maxAttempts = 10
  timer = setInterval(() => {
    if (disposed) {
      if (timer) clearInterval(timer)
      return
    }
    attempts += 1
    apply()
    if (attempts >= maxAttempts) {
      if (timer) clearInterval(timer)
      timer = null
    }
  }, 500)

  const dispose = () => {
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
    ctx.effect(() => dispose, 'omnimux: session-copy i18n maintainer')
  }

  return dispose
}
