/**
 * Injects and maintains adaptive localized copy and smart search for slash commands.
 *
 * Resolves:
 * 1. Command name (item.name) adaptive localization:
 *    - In Chinese locale (zh), renders Chinese command names (e.g. "add-file" -> "添加文件")
 *    - In English locale (en), retains canonical English command names (e.g. "add-file")
 * 2. Command description adaptive localization:
 *    - In Chinese locale (zh), renders concise Chinese descriptions (e.g. "从本地选择文件或图片")
 *    - In English locale (en), renders canonical English descriptions
 * 3. Bidirectional transparent mapping:
 *    - Intercepts `dispatch`, `matchSpace`, and `matchEnter` so that selecting or entering
 *      Chinese command names transparently resolves and executes the underlying native Host command.
 * 4. Smart multi-modal query matching:
 *    - Typing Chinese keywords, pinyin, or English tokens all match and prioritize seamlessly.
 */

export const COMMAND_I18N = {
  zh: {
    'add-file': {
      name: '添加文件',
      description: '从本地选择文件或图片',
      keywords: ['文件', '添加', 'wenjian', 'tianjia', 'file', 'upload', 'add-file', 'addfile', 'add'],
    },
    'add-from-library': {
      name: '从资产库添加',
      description: '从统一资产库选择素材',
      keywords: ['资产', '素材', '资产库', '素材库', 'zichan', 'sucai', 'library', 'add-from-library'],
    },
    'compact': {
      name: '压缩历史',
      description: '压缩较早的历史对话上下文',
      keywords: ['压缩', '清理', '历史', '会话', '上下文', 'yashuo', 'compact', 'history'],
    },
    'feedback': {
      name: '会话反馈',
      description: '记录本轮会话评价或问题',
      keywords: ['反馈', '评价', '建议', 'fankui', 'feedback'],
    },
    'goal': {
      name: '任务目标',
      description: '设定或查看长任务执行目标',
      keywords: ['目标', '任务', 'mubiao', 'renwu', 'goal', 'task'],
    },
    'permission': {
      name: '权限预设',
      description: '切换运行权限预设 (沙箱/免审批)',
      keywords: ['权限', '沙箱', '审批', 'quanxian', 'shaxiang', 'permission'],
    },
    'plan': {
      name: '计划模式',
      description: '开启或退出长任务计划模式',
      keywords: ['计划', '方案', '模式', 'jihua', 'plan', 'mode'],
    },
    'export': {
      name: '导出日志',
      description: '下载当前会话完整日志 (ZIP)',
      keywords: ['导出', '下载', '日志', 'daochu', 'xiazai', 'export', 'log', 'zip'],
    },
  },
  en: {
    'add-file': {
      name: 'add-file',
      description: 'Add files',
      keywords: ['file', 'upload', 'add'],
    },
    'add-from-library': {
      name: 'add-from-library',
      description: 'Add from library',
      keywords: ['library', 'asset', 'add'],
    },
    'compact': {
      name: 'compact',
      description: 'Compact older conversation history',
      keywords: ['compact', 'history', 'clean'],
    },
    'feedback': {
      name: 'feedback',
      description: 'Record feedback about this session',
      keywords: ['feedback', 'session', 'report'],
    },
    'goal': {
      name: 'goal',
      description: 'Set or view the goal for a long-running task',
      keywords: ['goal', 'task', 'objective'],
    },
    'permission': {
      name: 'permission',
      description: 'Switch the permission preset (sandbox, approval)',
      keywords: ['permission', 'sandbox', 'preset'],
    },
    'plan': {
      name: 'plan',
      description: 'Enter or leave plan mode',
      keywords: ['plan', 'mode', 'planning'],
    },
    'export': {
      name: 'export',
      description: 'Download this Session log as a ZIP archive',
      keywords: ['export', 'download', 'log', 'archive', 'zip'],
    },
  },
}

/**
 * Reverse lookup dictionary: Chinese display name -> canonical raw command name.
 */
export const ZH_NAME_TO_RAW = Object.freeze(
  Object.fromEntries(
    Object.entries(COMMAND_I18N.zh).map(([raw, conf]) => [conf.name, raw])
  )
)

/**
 * Resolve canonical raw command name from any alias or localized display name.
 * @param {string} name
 * @returns {string}
 */
export function resolveRawCommandName(name) {
  if (!name || typeof name !== 'string') return name || ''
  return ZH_NAME_TO_RAW[name] || name
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
 * Resolve localized display name for a command candidate.
 * @param {string} rawName
 * @param {any} [locale]
 * @returns {string}
 */
export function resolveCommandDisplayName(rawName, locale) {
  const lang = getActiveLang(locale)
  const config = COMMAND_I18N[lang]?.[rawName]
  if (config?.name) {
    return config.name
  }
  return rawName
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
  const rawName = resolveRawCommandName(name)
  const config = COMMAND_I18N[lang]?.[rawName]
  if (config?.description) {
    return config.description
  }
  return splitBilingualDescription(fallbackDesc || '', lang)
}

/**
 * Calculate match relevance score for a command candidate.
 * Higher score means better match. Returns undefined if not matched.
 * @param {{ name: string, rawName?: string, description?: string }} candidate
 * @param {string} rawQuery
 * @param {'zh' | 'en'} lang
 * @returns {number | undefined}
 */
export function scoreCommandCandidate(candidate, rawQuery, lang) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return 1

  const name = (candidate.name || '').toLowerCase()
  const rawName = (candidate.rawName || candidate.name || '').toLowerCase()
  const desc = (candidate.description || '').toLowerCase()
  const config = COMMAND_I18N[lang]?.[candidate.rawName || candidate.name]
  const keywords = (config?.keywords || []).map(k => k.toLowerCase())

  // 1. Exact name or rawName match
  if (name === query || rawName === query) return 1000

  // 2. Name or rawName prefix match
  if (name.startsWith(query)) return 600 - (name.length - query.length)
  if (rawName.startsWith(query)) return 500 - (rawName.length - query.length)

  // 3. Name or rawName substring match
  const nameIdx = name.indexOf(query)
  if (nameIdx >= 0) return 400 - nameIdx
  const rawIdx = rawName.indexOf(query)
  if (rawIdx >= 0) return 300 - rawIdx

  // 4. Description exact or prefix match
  if (desc.startsWith(query)) return 200

  // 5. Description substring match
  const descIdx = desc.indexOf(query)
  if (descIdx >= 0) return 150 - descIdx

  // 6. Keywords match
  for (const kw of keywords) {
    if (kw === query) return 130
    if (kw.startsWith(query)) return 110
    if (kw.includes(query)) return 90
  }

  // 7. Subsequence match on rawName
  let qIdx = 0
  for (let i = 0; i < rawName.length && qIdx < query.length; i++) {
    if (rawName[i] === query[qIdx]) qIdx++
  }
  if (qIdx === query.length) return 50

  return undefined
}

/**
 * Enhance command candidates by localizing names & descriptions and ranking with smart search.
 * @param {Array<{ name: string, rawName?: string, description?: string, hint?: string }>} allRows
 * @param {{ query?: string }} req
 * @param {any} locale
 * @returns {Array<{ name: string, rawName: string, description?: string, hint?: string }>}
 */
export function enhanceCommandCandidates(allRows, req, locale) {
  if (!Array.isArray(allRows)) return []
  const lang = getActiveLang(locale)

  // 1. Localize both name and description for each candidate
  const localized = allRows.map((row) => {
    const rawName = row.rawName || row.name
    const displayName = resolveCommandDisplayName(rawName, locale)
    const displayDesc = resolveCommandDescription(rawName, row.description, locale)
    return {
      ...row,
      name: displayName,
      rawName,
      description: displayDesc,
    }
  })

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
 * Method-wrap `commandUi` methods (candidates, dispatch, matchSpace, matchEnter) in-place safely.
 * @param {any} commandUi
 * @param {any} locale
 * @returns {() => void} Disposer to restore original methods
 */
export function wrapCommandUi(commandUi, locale) {
  if (!commandUi || typeof commandUi.candidates !== 'function') {
    return () => {}
  }

  const originalCandidates = commandUi.candidates
  const originalDispatch = typeof commandUi.dispatch === 'function' ? commandUi.dispatch : null
  const originalMatchSpace = typeof commandUi.matchSpace === 'function' ? commandUi.matchSpace : null
  const originalMatchEnter = typeof commandUi.matchEnter === 'function' ? commandUi.matchEnter : null

  const boundCandidates = originalCandidates.bind(commandUi)
  const boundDispatch = originalDispatch ? originalDispatch.bind(commandUi) : null
  const boundMatchSpace = originalMatchSpace ? originalMatchSpace.bind(commandUi) : null
  const boundMatchEnter = originalMatchEnter ? originalMatchEnter.bind(commandUi) : null

  // 1. Wrap candidates to yield adaptive names and descriptions
  const wrappedCandidates = async function (session, req) {
    try {
      const baseReq = req ? { ...req, query: '' } : { query: '' }
      const allRows = await boundCandidates(session, baseReq)
      return enhanceCommandCandidates(allRows, req, locale)
    } catch {
      return boundCandidates(session, req)
    }
  }

  // 2. Wrap dispatch to transparently unwrap localized candidate name to rawName
  const wrappedDispatch = boundDispatch ? function (pick) {
    if (!pick || !pick.candidate) return boundDispatch(pick)
    const rawName = pick.candidate.rawName || resolveRawCommandName(pick.candidate.name)
    const normalizedCandidate = {
      ...pick.candidate,
      name: rawName,
    }
    return boundDispatch({
      ...pick,
      candidate: normalizedCandidate,
    })
  } : null

  // 3. Wrap matchSpace to map localized token to rawName
  const wrappedMatchSpace = boundMatchSpace ? function (session, token) {
    if (!token || typeof token !== 'string' || !token.startsWith('/')) {
      return boundMatchSpace(session, token)
    }
    const name = token.slice(1)
    const rawName = resolveRawCommandName(name)
    if (rawName !== name) {
      return boundMatchSpace(session, `/${rawName}`)
    }
    return boundMatchSpace(session, token)
  } : null

  // 4. Wrap matchEnter to map localized line to rawName
  const wrappedMatchEnter = boundMatchEnter ? async function (session, line, signal, envelope) {
    const trimmed = (line || '').trim()
    if (!trimmed.startsWith('/')) {
      return boundMatchEnter(session, line, signal, envelope)
    }
    const ws = trimmed.search(/\s/)
    const token = ws === -1 ? trimmed : trimmed.slice(0, ws)
    const name = token.slice(1)
    const rawName = resolveRawCommandName(name)
    if (rawName !== name) {
      const mappedLine = ws === -1 ? `/${rawName}` : `/${rawName} ${trimmed.slice(ws + 1)}`
      return boundMatchEnter(session, mappedLine, signal, envelope)
    }
    return boundMatchEnter(session, line, signal, envelope)
  } : null

  commandUi.candidates = wrappedCandidates
  if (wrappedDispatch) commandUi.dispatch = wrappedDispatch
  if (wrappedMatchSpace) commandUi.matchSpace = wrappedMatchSpace
  if (wrappedMatchEnter) commandUi.matchEnter = wrappedMatchEnter

  return () => {
    if (commandUi.candidates === wrappedCandidates) commandUi.candidates = originalCandidates
    if (originalDispatch && commandUi.dispatch === wrappedDispatch) commandUi.dispatch = originalDispatch
    if (originalMatchSpace && commandUi.matchSpace === wrappedMatchSpace) commandUi.matchSpace = originalMatchSpace
    if (originalMatchEnter && commandUi.matchEnter === wrappedMatchEnter) commandUi.matchEnter = originalMatchEnter
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
