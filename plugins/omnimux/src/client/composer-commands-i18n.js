/**
 * Injects and maintains adaptive localized copy and smart search for slash commands.
 *
 * Resolves both:
 * 1. Command description localization based on DSH active locale (zh / en):
 *    - Replaces hardcoded bilingual slash concatenation (e.g. "添加文件 / Add files" -> "添加文件")
 *    - Replaces hardcoded English descriptions on built-in commands (compact, plan, goal, etc.)
 * 2. Smart query matching:
 *    - Enables searching English commands via Chinese keywords, pinyin, or localized descriptions
 *    - e.g. typing "/文件" or "/tianjia" matches "add-file" seamlessly.
 */

export const COMMAND_I18N = {
  zh: {
    'add-file': {
      description: '添加文件',
      keywords: ['文件', '添加', 'wenjian', 'tianjia', 'file', 'upload'],
    },
    'add-from-library': {
      description: '从资产库添加',
      keywords: ['资产', '素材', '资产库', '素材库', 'zichan', 'sucai', 'library'],
    },
    'compact': {
      description: '压缩历史对话上下文',
      keywords: ['压缩', '清理', '历史', '会话', '上下文', 'yashuo', 'compact', 'history'],
    },
    'feedback': {
      description: '记录会话反馈',
      keywords: ['反馈', '评价', '建议', 'fankui', 'feedback'],
    },
    'goal': {
      description: '设定或查看长任务目标',
      keywords: ['目标', '任务', 'mubiao', 'renwu', 'goal', 'task'],
    },
    'permission': {
      description: '切换权限预设 (沙箱/免审批)',
      keywords: ['权限', '沙箱', '审批', 'quanxian', 'shaxiang', 'permission'],
    },
    'plan': {
      description: '进入或退出计划模式',
      keywords: ['计划', '方案', '模式', 'jihua', 'plan', 'mode'],
    },
    'export': {
      description: '导出并下载会话日志 (ZIP)',
      keywords: ['导出', '下载', '日志', 'daochu', 'xiazai', 'export', 'log', 'zip'],
    },
  },
  en: {
    'add-file': {
      description: 'Add files',
      keywords: ['file', 'upload', 'add'],
    },
    'add-from-library': {
      description: 'Add from library',
      keywords: ['library', 'asset', 'add'],
    },
    'compact': {
      description: 'Compact older conversation history',
      keywords: ['compact', 'history', 'clean'],
    },
    'feedback': {
      description: 'Record feedback about this session',
      keywords: ['feedback', 'session', 'report'],
    },
    'goal': {
      description: 'Set or view the goal for a long-running task',
      keywords: ['goal', 'task', 'objective'],
    },
    'permission': {
      description: 'Switch the permission preset (sandbox, approval)',
      keywords: ['permission', 'sandbox', 'preset'],
    },
    'plan': {
      description: 'Enter or leave plan mode',
      keywords: ['plan', 'mode', 'planning'],
    },
    'export': {
      description: 'Download this Session log as a ZIP archive',
      keywords: ['export', 'download', 'log', 'archive', 'zip'],
    },
  },
}

/**
 * Determine if current active locale is Chinese.
 * @param {any} locale
 * @returns {boolean}
 */
export function isZhLocale(locale) {
  if (!locale) return true
  const active = (typeof locale.getSnapshot === 'function' ? locale.getSnapshot()?.active : locale.current) || ''
  return !String(active).toLowerCase().startsWith('en')
}

/**
 * Resolve the current active language ('zh' | 'en').
 * @param {any} locale
 * @returns {'zh' | 'en'}
 */
export function getActiveLang(locale) {
  return isZhLocale(locale) ? 'zh' : 'en'
}

/**
 * Split bilingual descriptions like "添加文件 / Add files" if present.
 * @param {string} desc
 * @param {'zh' | 'en'} lang
 * @returns {string}
 */
export function splitBilingualDescription(desc, lang) {
  if (!desc || typeof desc !== 'string') return desc || ''
  const parts = desc.split(/\s*\/\s*/)
  if (parts.length === 2 && /[\u4e00-\u9fa5]/.test(parts[0]) && /^[A-Za-z0-9\s._(),-]+$/.test(parts[1])) {
    return lang === 'zh' ? parts[0].trim() : parts[1].trim()
  }
  return desc
}

/**
 * Resolve localized description for a given command name.
 * @param {string} name
 * @param {string} [fallbackDesc]
 * @param {any} [locale]
 * @returns {string}
 */
export function resolveCommandDescription(name, fallbackDesc, locale) {
  const lang = getActiveLang(locale)
  const config = COMMAND_I18N[lang]?.[name]
  if (config?.description) {
    return config.description
  }
  return splitBilingualDescription(fallbackDesc || '', lang)
}

/**
 * Calculate match relevance score for a command candidate.
 * Higher score means better match. Returns undefined if not matched.
 * @param {{ name: string, description?: string }} candidate
 * @param {string} rawQuery
 * @param {'zh' | 'en'} lang
 * @returns {number | undefined}
 */
export function scoreCommandCandidate(candidate, rawQuery, lang) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return 1

  const name = candidate.name.toLowerCase()
  const desc = (candidate.description || '').toLowerCase()
  const config = COMMAND_I18N[lang]?.[candidate.name]
  const keywords = (config?.keywords || []).map(k => k.toLowerCase())

  // 1. Exact name match
  if (name === query) return 1000

  // 2. Name prefix match
  if (name.startsWith(query)) return 500 - (name.length - query.length)

  // 3. Name substring match
  const nameIdx = name.indexOf(query)
  if (nameIdx >= 0) return 300 - nameIdx

  // 4. Description exact or prefix match
  if (desc.startsWith(query)) return 200

  // 5. Description substring match
  const descIdx = desc.indexOf(query)
  if (descIdx >= 0) return 150 - descIdx

  // 6. Keywords match
  for (const kw of keywords) {
    if (kw === query) return 120
    if (kw.startsWith(query)) return 100
    if (kw.includes(query)) return 80
  }

  // 7. Subsequence/fuzzy match fallback on name
  let qIdx = 0
  for (let i = 0; i < name.length && qIdx < query.length; i++) {
    if (name[i] === query[qIdx]) qIdx++
  }
  if (qIdx === query.length) return 50

  return undefined
}

/**
 * Enhance command candidates by localizing descriptions and ranking with smart search.
 * @param {Array<{ name: string, description?: string, hint?: string }>} allRows
 * @param {{ query?: string }} req
 * @param {any} locale
 * @returns {Array<{ name: string, description?: string, hint?: string }>}
 */
export function enhanceCommandCandidates(allRows, req, locale) {
  if (!Array.isArray(allRows)) return []
  const lang = getActiveLang(locale)

  // 1. Localize each candidate
  const localized = allRows.map((row) => ({
    ...row,
    description: resolveCommandDescription(row.name, row.description, locale),
  }))

  const rawQuery = (req?.query || '').trim()
  if (!rawQuery) {
    return localized
  }

  // 2. Filter and score
  const scored = []
  localized.forEach((candidate, index) => {
    const score = scoreCommandCandidate(candidate, rawQuery, lang)
    if (score !== undefined) {
      scored.push({ candidate, score, index })
    }
  })

  // 3. Stable sort: higher score first, retain original relative index on tie
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.candidate)
}

/**
 * Method-wrap `commandUi.candidates` in-place safely.
 * @param {any} commandUi
 * @param {any} locale
 * @returns {() => void} Disposer to restore original method
 */
export function wrapCommandUi(commandUi, locale) {
  if (!commandUi || typeof commandUi.candidates !== 'function') {
    return () => {}
  }

  const originalMethod = commandUi.candidates
  const boundOriginal = originalMethod.bind(commandUi)

  const wrappedCandidates = async function (session, req) {
    try {
      // Pass empty query to retrieve the complete candidate pool for this session
      const baseReq = req ? { ...req, query: '' } : { query: '' }
      const allRows = await boundOriginal(session, baseReq)
      return enhanceCommandCandidates(allRows, req, locale)
    } catch {
      // Safe fallback on any error
      return boundOriginal(session, req)
    }
  }

  commandUi.candidates = wrappedCandidates

  return () => {
    if (commandUi.candidates === wrappedCandidates) {
      commandUi.candidates = originalMethod
    }
  }
}

/**
 * Install the adaptive command localization into client runtime.
 * @param {{ inject?: Function }} ctx
 */
export function installCommandsI18n(ctx) {
  if (!ctx || typeof ctx.inject !== 'function') return
  ctx.inject(['commandUi', 'locale'], (inner) => {
    inner.effect?.(() => {
      const commandUi = inner.commandUi || inner.get?.('commandUi')
      const locale = inner.locale || inner.get?.('locale')
      return wrapCommandUi(commandUi, locale)
    }, 'omnimux: command i18n & query enhancement')
  })
}
