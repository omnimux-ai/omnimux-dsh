import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const JS_SYNTAX_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])
const TEST_RE = /(?:^|[./\\])[^/\\]*\.(?:test|spec)\.[^/\\]+$/
const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g
const VENDOR_ENGINE_RE = /(?:^|[\\/])engine[\\/]openreel(?:[\\/]|$)/
const CONTENT_PRESET_RE = /(?:timelineTypes\.js|pixel-avatar-constants\.js)$/
const JSX_TAG_RE = /<[A-Za-z][A-Za-z0-9._-]*(?:\s+[^>]*)?(?:\/>|>[^<]*<\/[A-Za-z][A-Za-z0-9._-]*>)/
const JSX_RETURN_RE = /return\s+<[A-Za-z][A-Za-z0-9._-]*/
const ONE_SHOT_FEEDBACK_RE = /\bsetTimeout\s*\(\s*(?:\(\s*\)\s*=>|\bfunction\b)[^{}]*(?:setCopied|setStatus|setNotice|setMessage|setFeedback|setShowToast|toast|copied|notice)\b[^{}]*,\s*(?:[1-9][0-9]{2,3})\s*\)/
const ONE_SHOT_BLOCK_RE = new RegExp(
  String.raw`\bsetTimeout\s*\(\s*(?:\(\s*\)\s*=>|\bfunction\b)\s*\{[^;{}]{1,160}\}\s*,\s*(?:[1-9][0-9]{2,3})\s*\)`
)
const EFFECT_CLEANUP_RE = new RegExp(
  String.raw`useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*return\s+[\s\S]*\}\s*,\s*\[`
)
const STAGE_FILE_RE = new RegExp(String.raw`(^|\/)[^/]*Stage\.(jsx|tsx|js|ts)$`)
const TRANSPARENT = new Set(['#fff', '#ffffff', '#000', '#000000', 'rgba(0,0,0,0)'])

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/i,
  /ghp_[a-zA-Z0-9]{20,}/i,
  /AIza[0-9A-Za-z-_]{35}/i,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i,
]

// base64 承载的凭据逐字面量解码后再跑 SECRET_PATTERNS（明文规则对手工编码的密钥 0 命中）。
const ENCODED_SECRET_LITERAL_PATTERNS = [
  /\batob\s*\(\s*(['"])([A-Za-z0-9+/=_-]{16,})\1\s*\)/g,
  /\bBuffer\.from\s*\(\s*(['"])([A-Za-z0-9+/=_-]{16,})\1\s*,\s*(['"])(?:base64|base64url)\3\s*\)/g,
]

/**
 * 扩展联网出口白名单（唯一真源，审查只需看这里）。
 *
 * 扩展页 connect-src 只允许两类出口：
 *   1. 本机服务：`127.0.0.1` / `localhost` / `::1`，含 `ws://` / `wss://`、
 *      任意端口与端口通配 `:*`（由 LOOPBACK_HOSTS 无条件放行，不在此列表重复声明）；
 *   2. 下面显式列出的仓库白名单主机。
 * 其它任何主机（例如 api.deepseek.com、api.apikey.fun）以及 `*` 通配一律阻断。
 */
export const EXTENSION_CONNECT_SRC_ALLOWED_HOSTS = [
  // 扩展分发资源的唯一公开来源（更新检查与静态资源）。
  'raw.githubusercontent.com',
]

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const NON_NETWORK_SCHEME_RE = /^(?:data|blob|filesystem|about|chrome|chrome-extension|moz-extension|javascript|file):/i
const EXTENSION_MANIFEST_RE = /^plugins\/[^/]+\/extension\/manifest(?:\.[A-Za-z0-9_-]+)?\.json$/
const CONNECT_SRC_DIRECTIVE_RE = /\bconnect-src\b([^;]*)/gi

/** 扩展清单路径：plugins/<name>/extension/manifest.json 与 manifest.<variant>.json。 */
export function isExtensionManifestPath(rel) {
  return EXTENSION_MANIFEST_RE.test(String(rel || '').replaceAll('\\', '/'))
}

function decodeBase64Literal(value) {
  const normalized = String(value).replaceAll('-', '+').replaceAll('_', '/')
  try {
    return Buffer.from(normalized, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/** 源码里是否存在解码后命中密钥特征的 base64 字面量（atob / Buffer.from base64）。 */
export function hasEncodedCredential(content) {
  for (const pattern of ENCODED_SECRET_LITERAL_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(content)) !== null) {
      const decoded = decodeBase64Literal(match[2])
      if (decoded && SECRET_PATTERNS.some((rule) => rule.test(decoded))) return true
    }
  }
  return false
}

/** connect-src 令牌 → 主机名；CSP 关键字（'self' 等）与非网络地址返回 null。 */
export function connectSrcHost(token) {
  let rest = String(token || '').trim()
  if (!rest || rest.startsWith("'")) return null
  if (NON_NETWORK_SCHEME_RE.test(rest)) return null
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(rest)
  if (scheme) rest = rest.slice(scheme[0].length)
  rest = rest.replace(/^[^/@]*@/, '').split(/[/?#]/)[0]
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']')
    return end === -1 ? null : rest.slice(1, end).toLowerCase() || null
  }
  const colon = rest.lastIndexOf(':')
  if (colon !== -1) rest = rest.slice(0, colon)
  return rest.toLowerCase() || null
}

/** 主机是否被放行（本机环回 + 显式白名单）。 */
export function isAllowedExtensionHost(host) {
  const normalized = String(host || '').trim().toLowerCase()
  if (!normalized) return false
  if (LOOPBACK_HOSTS.has(normalized)) return true
  return EXTENSION_CONNECT_SRC_ALLOWED_HOSTS.includes(normalized)
}

// 把 CSP 的字符串 / 数组 / 对象三种形态拍平成指令文本，供统一的 connect-src 抽取复用。
function cspTextFromValue(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => cspTextFromValue(item)).join(' ')
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key} ${cspTextFromValue(item)};`)
      .join(' ')
  }
  return ''
}

function asTextList(value) {
  if (Array.isArray(value)) return value.map((item) => cspTextFromValue(item))
  if (value === undefined || value === null) return []
  return [cspTextFromValue(value)]
}

/** 抽出清单声明的全部 connect-src 主机（含 host_permissions / permissions 中的 connect-src 声明）。 */
export function connectSrcHostsFromManifest(manifest) {
  const texts = [
    cspTextFromValue(manifest?.content_security_policy),
    ...asTextList(manifest?.host_permissions),
    ...asTextList(manifest?.permissions),
  ]
  const hosts = []
  for (const text of texts) {
    if (!text) continue
    CONNECT_SRC_DIRECTIVE_RE.lastIndex = 0
    let match
    while ((match = CONNECT_SRC_DIRECTIVE_RE.exec(text)) !== null) {
      for (const token of match[1].trim().split(/\s+/)) {
        const host = connectSrcHost(token)
        if (host) hosts.push(host)
      }
    }
  }
  return hosts
}

/** 越界的 connect-src 主机列表；清单不是合法 JSON 时返回 null（无法校验）。 */
export function extensionOutboundViolations(manifestText) {
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch {
    return null
  }
  const seen = new Set()
  const violations = []
  for (const host of connectSrcHostsFromManifest(manifest)) {
    if (isAllowedExtensionHost(host) || seen.has(host)) continue
    seen.add(host)
    violations.push(host)
  }
  return violations
}

const SECURITY_RULES = [
  {
    check: (content) => SECRET_PATTERNS.some((pattern) => pattern.test(content)),
    message: '检测到疑似硬编码敏感凭据。',
  },
  {
    check: (content) => hasEncodedCredential(content),
    message: '检测到 base64 承载的硬编码凭据（解码后命中密钥特征）。',
  },
  {
    fileMatch: EXTENSION_MANIFEST_RE,
    // 该规则需要报出具体越界主机，故直接产出文案。
    inspect: (content) => {
      const violations = extensionOutboundViolations(content)
      if (violations === null) return '扩展清单不是合法 JSON，无法校验联网出口白名单。'
      if (violations.length === 0) return null
      return `扩展联网出口只允许本机服务与本仓库白名单主机，禁止 ${violations.join('、')}。`
    },
  },
  {
    check: (content) => /JSON\.(?:stringify|parse)\s*\(\s*(?:ctx|service|session|props)\b/.test(content),
    message: '禁止直接序列化 live ctx/Service/Session/Props。',
  },
  {
    check: (content) => /writeFile(?:Sync)?\s*\(\s*['"]\.\.\//.test(content),
    message: '检测到向父级目录跨界写入。',
  },
]

const DIMENSION_CHECKS = [
  ['syntax', (count) => `已检查 ${count} 个变更源码文件的 JavaScript 语法与动态插件语法`],
  ['lifecycle', '已检查定时器、全局事件与 disposer 线索'],
  ['security', '已检查凭据（含 base64 载体）、扩展联网出口白名单、live data 序列化与跨界写入'],
  ['tokens', '已检查 UI 裸颜色与废弃 token（无 UI 变更时为空检查）'],
  ['guards', '已检查 Stage 保活线索（无 Stage 变更时为空检查）'],
]

export function isTestFile(file) {
  return TEST_RE.test(file)
}

export function normalizedRelative(root, file) {
  return relative(root, file).replaceAll('\\', '/')
}

function addError(report, dimension, error) {
  report.dimensions[dimension].errors.push(error)
  report.dimensions[dimension].pass = false
}

function readText(file, report, dimension = 'syntax') {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    addError(report, dimension, {
      file: relative(report.targetDir, file),
      message: `无法读取文件：${error.message}`,
    })
    return null
  }
}

function skipLineComment(source, startIndex) {
  let output = '  '
  let index = startIndex + 2
  while (index < source.length && source[index] !== '\n') {
    output += ' '
    index += 1
  }
  return { output, nextIndex: index }
}

function skipBlockComment(source, startIndex) {
  let output = '  '
  let index = startIndex + 2
  while (index < source.length) {
    if (source[index] === '*' && source[index + 1] === '/') {
      output += '  '
      index += 2
      break
    }
    output += source[index] === '\n' ? '\n' : ' '
    index += 1
  }
  return { output, nextIndex: index }
}

function handleEscape(source, index) {
  let output = '\\'
  let next = index + 1
  if (next < source.length) {
    output += source[next] === '\n' ? '\n' : ' '
    next += 1
  }
  return { output, nextIndex: next }
}

function skipStringLiteral(source, startIndex, quote) {
  let output = ' '
  let index = startIndex + 1
  while (index < source.length) {
    const current = source[index]
    if (current === '\\') {
      const escaped = handleEscape(source, index)
      output += escaped.output
      index = escaped.nextIndex
      continue
    }
    if (current === quote) {
      output += ' '
      index += 1
      break
    }
    output += current === '\n' ? '\n' : ' '
    index += 1
  }
  return { output, nextIndex: index }
}

// Remove comments and quoted literals before syntax heuristics. HTML strings
// used by a client module are data, not JSX; actual JSX tags remain visible.
export function maskNonCode(source) {
  let output = ''
  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      const masked = skipLineComment(source, index)
      output += masked.output
      index = masked.nextIndex
      continue
    }

    if (char === '/' && next === '*') {
      const masked = skipBlockComment(source, index)
      output += masked.output
      index = masked.nextIndex
      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      const masked = skipStringLiteral(source, index, char)
      output += masked.output
      index = masked.nextIndex
      continue
    }

    output += char
    index += 1
  }
  return output
}

function scanNodeSyntax(report, file, rel) {
  if (isTestFile(file)) return
  if (!JS_SYNTAX_EXTENSIONS.has(extname(file))) return
  const syntax = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (syntax.status === 0) return
  addError(report, 'syntax', {
    file: rel,
    message: `Node 语法检查失败：${(syntax.stderr || syntax.stdout || '').trim()}`,
  })
}

function scanJsxInPlainJs(report, file, rel, content) {
  if (isTestFile(file)) return
  if (extname(file) !== '.js') return
  if (rel.startsWith('scripts/')) return
  if (/(^|\/)(lib|dist)\//.test(rel)) return
  const codeOnly = maskNonCode(content)
  const hasJsxTag = JSX_TAG_RE.test(codeOnly) || JSX_RETURN_RE.test(codeOnly)
  if (!hasJsxTag) return
  if (content.includes('React.createElement')) return
  addError(report, 'syntax', {
    file: rel,
    message: 'Plain JS 文件检测到疑似 JSX 语法，请使用 React.createElement 或合规编译入口。',
  })
}

function lifecycleFlags(content) {
  const codeOnly = maskNonCode(content)
  return {
    setInterval: /\bsetInterval\s*\(/.test(codeOnly),
    clearInterval: /\bclearInterval\s*\(/.test(codeOnly),
    setTimeout: /\bsetTimeout\s*\(/.test(codeOnly),
    clearTimeout: /\bclearTimeout\s*\(/.test(codeOnly),
    disposer: /\b(?:dispose|disposed|unsubscribe|unmount|destroy|stop|clear)\b/i.test(codeOnly),
    effectCleanup: EFFECT_CLEANUP_RE.test(content),
    contextTimeout: /\bctx\.(?:timeout|effect|disposer)\b/.test(codeOnly),
    oneShotFeedback: ONE_SHOT_FEEDBACK_RE.test(codeOnly) || ONE_SHOT_BLOCK_RE.test(codeOnly),
    timerRef: /\b(?:timer|timerRef|timeoutRef|pollTimer|debounceTimer|idleTimer|intervalRef)\b/i.test(codeOnly),
  }
}

function checkIntervalCleanup(report, rel, flags) {
  if (!flags.setInterval) return
  const hasCleanup = Boolean(
    flags.clearInterval ||
    flags.contextTimeout ||
    flags.disposer ||
    flags.effectCleanup
  )
  if (hasCleanup) return
  addError(report, 'lifecycle', {
    file: rel,
    message: '存在 setInterval 但未发现 clearInterval、ctx.timeout 或 ctx.effect 清理路径。',
  })
}

function checkTimeoutCleanup(report, rel, flags) {
  if (!flags.setTimeout) return
  if (!flags.timerRef) return
  const hasCleanup = Boolean(
    flags.clearTimeout ||
    flags.contextTimeout ||
    flags.disposer ||
    flags.effectCleanup ||
    flags.oneShotFeedback
  )
  if (hasCleanup) return
  addError(report, 'lifecycle', {
    file: rel,
    message: '存在带持久引动的 setTimeout 但未发现 clearTimeout、ctx.timeout 或 ctx.effect 清理路径。',
  })
}

function checkEventListenerCleanup(report, rel, content) {
  const adds = content.match(/(?:window|document)\.addEventListener\s*\(/g) || []
  if (adds.length === 0) return
  const removes = content.match(/(?:window|document)\.removeEventListener\s*\(/g) || []
  if (removes.length >= adds.length) return
  if (content.includes('PRODUCT_STAGE_EVENT')) return
  if (content.includes('createStageStore')) return
  if (content.includes('unsubscribe')) return
  addError(report, 'lifecycle', {
    file: rel,
    message: `检测到 ${adds.length} 处全局 addEventListener，但可见注销数仅 ${removes.length}。`,
  })
}

function scanLifecycle(report, file, rel, content) {
  if (isTestFile(file)) return
  if (rel.startsWith('scripts/')) return
  if (VENDOR_ENGINE_RE.test(rel)) return

  const flags = lifecycleFlags(content)
  checkIntervalCleanup(report, rel, flags)
  checkTimeoutCleanup(report, rel, flags)
  checkEventListenerCleanup(report, rel, content)
}

function isSecurityScanSkipped(file, rel) {
  if (isTestFile(file)) return true
  if (rel.startsWith('scripts/')) return true
  if (rel.includes('fixtures/')) return true
  return false
}

function securityRuleMessage(rule, content, rel) {
  if (rule.fileMatch && !rule.fileMatch.test(rel)) return null
  if (typeof rule.inspect === 'function') return rule.inspect(content, rel)
  return rule.check(content, rel) ? rule.message : null
}

function collectSecurityErrors(report, rel, content) {
  for (const rule of SECURITY_RULES) {
    const message = securityRuleMessage(rule, content, rel)
    if (message) {
      addError(report, 'security', {
        file: rel,
        message,
      })
    }
  }
}

function securityDimension() {
  return { pass: true, checks: [], errors: [] }
}

/** 对单段文本跑安全规则，返回命中文案（供门禁与测试复用）。 */
export function securityViolations(rel, content) {
  const report = { targetDir: '', dimensions: { security: securityDimension() } }
  collectSecurityErrors(report, rel, content)
  return report.dimensions.security.errors.map((error) => error.message)
}

/** 对一组真实文件跑安全维度（跳过测试文件、scripts/ 与 fixtures/，与门禁口径一致）。 */
export function securityFindings(files, root) {
  const report = { targetDir: root, dimensions: { security: securityDimension() } }
  for (const file of files) {
    const rel = normalizedRelative(root, file)
    if (isSecurityScanSkipped(file, rel)) continue
    const content = readText(file, report, 'security')
    if (content === null) continue
    collectSecurityErrors(report, rel, content)
  }
  return report.dimensions.security.errors
}

function scanSecurity(report, file, rel, content) {
  if (isSecurityScanSkipped(file, rel)) return
  collectSecurityErrors(report, rel, content)
}

function isIgnoredTokenLine(trimmed, line) {
  if (!trimmed) return true
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.includes('/*')) return true
  if (/data:image\/|url\(|content\s*:/.test(line)) return true
  return false
}

function findRawColorViolation(line) {
  const matches = line.match(RAW_COLOR_RE)
  if (!matches) return null
  const filtered = matches.filter((value) => !TRANSPARENT.has(value.toLowerCase()))
  if (filtered.length === 0) return null
  if (/var\(\s*--dsw-[a-z0-9_-]+\s*,\s*[^)]+\)/.test(line)) return null
  if (line.includes('--dsw-')) return null
  return filtered.join(', ')
}

function scanTokens(report, file, rel, content) {
  if (!rel.includes('/client/')) return
  if (isTestFile(file)) return
  if (VENDOR_ENGINE_RE.test(rel)) return
  if (CONTENT_PRESET_RE.test(rel)) return

  if (content.includes('--omx-')) {
    addError(report, 'tokens', {
      file: rel,
      message: '使用了已废弃的 --omx-* 变量。',
    })
  }

  const lines = content.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (isIgnoredTokenLine(trimmed, line)) continue
    const violation = findRawColorViolation(line)
    if (!violation) continue
    addError(report, 'tokens', {
      file: rel,
      line: index + 1,
      message: `发现裸颜色值 (${violation})，必须使用 --dsw-* token。`,
    })
  }
}

function checkStageKeepAlive(report, rel, content, hasEverOpened) {
  const hasOpenState = /\b(?:open|isOpen|visible|active)\b/.test(content)
  const hasHiddenState = /display\s*:\s*['"]?none|hidden\s*[:=]/.test(content)
  if (!hasOpenState) return
  if (hasEverOpened && hasHiddenState) return
  addError(report, 'guards', {
    file: rel,
    message: 'Stage 文件缺少 everOpened + 隐藏而不卸载的保活证据。',
  })
}

function checkStageUnmountPattern(report, rel, content, hasEverOpened) {
  if (hasEverOpened) return
  const hasUnmountReturnNull = /if\s*\(\s*!\w+\s*\)\s*return\s+null/.test(content)
  if (!hasUnmountReturnNull) return
  addError(report, 'guards', {
    file: rel,
    message: '检测到关页 return null 卸树反模式。',
  })
}

function scanGuards(report, rel, content) {
  if (!STAGE_FILE_RE.test(rel)) return
  const hasEverOpened = content.includes('everOpened')
  checkStageKeepAlive(report, rel, content, hasEverOpened)
  checkStageUnmountPattern(report, rel, content, hasEverOpened)
}

function formatDimensionCheck(message, fileCount) {
  if (typeof message === 'function') {
    return message(fileCount)
  }
  return message
}

function scanTypeScriptSyntax(report, files, root) {
  const hasWorkflowTsChange = files.some((file) => {
    const rel = normalizedRelative(root, file)
    return rel.startsWith('plugins/omnimux-workflow/src/') && (rel.endsWith('.ts') || rel.endsWith('.tsx'))
  })
  if (!hasWorkflowTsChange) return
  const tscBin = join(root, 'plugins/omnimux-workflow/node_modules/typescript/bin/tsc')
  if (!existsSync(tscBin)) return
  const resCanvas = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.canvas.json', '--noEmit'], {
    cwd: join(root, 'plugins/omnimux-workflow'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (resCanvas.status !== 0) {
    addError(report, 'syntax', {
      file: 'plugins/omnimux-workflow/tsconfig.canvas.json',
      message: `TypeScript (canvas) 类型/语法检查未通过：\n${(resCanvas.stderr || resCanvas.stdout || '').trim().slice(0, 500)}`,
    })
  }
  const resHost = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.host.json', '--noEmit'], {
    cwd: join(root, 'plugins/omnimux-workflow'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (resHost.status !== 0) {
    addError(report, 'syntax', {
      file: 'plugins/omnimux-workflow/tsconfig.host.json',
      message: `TypeScript (host) 类型/语法检查未通过：\n${(resHost.stderr || resHost.stdout || '').trim().slice(0, 500)}`,
    })
  }
}

export function staticScan(report, files, root) {
  for (const file of files) {
    const rel = normalizedRelative(root, file)
    const content = readText(file, report)
    if (content === null) continue
    report.scannedFiles.push(rel)
    scanNodeSyntax(report, file, rel)
    scanJsxInPlainJs(report, file, rel, content)
    scanLifecycle(report, file, rel, content)
    scanSecurity(report, file, rel, content)
    scanTokens(report, file, rel, content)
    scanGuards(report, rel, content)
  }

  scanTypeScriptSyntax(report, files, root)

  for (const [dimension, message] of DIMENSION_CHECKS) {
    if (!report.dimensions[dimension].pass) continue
    report.dimensions[dimension].checks.push(formatDimensionCheck(message, files.length))
  }
}
