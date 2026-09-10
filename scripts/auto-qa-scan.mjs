import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const JS_SYNTAX_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])
const TEST_RE = /(?:^|[./\\])[^/\\]*\.(?:test|spec)\.[^/\\]+$/
const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g
const VENDOR_ENGINE_RE = /(?:^|[\\/])engine[\\/]openreel(?:[\\/]|$)/
const CONTENT_PRESET_RE = /^(?:plugins[\\/]omnimux-clip[\\/])?src[\\/]client[\\/]store[\\/]timelineTypes\.js$/
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

const SECURITY_RULES = [
  {
    check: (content) => SECRET_PATTERNS.some((pattern) => pattern.test(content)),
    message: '检测到疑似硬编码敏感凭据。',
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
  ['security', '已检查凭据、live data 序列化与跨界写入'],
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

function scanSecurity(report, file, rel, content) {
  if (isTestFile(file)) return
  if (rel.startsWith('scripts/')) return
  if (rel.includes('fixtures/')) return

  for (const rule of SECURITY_RULES) {
    if (rule.check(content)) {
      addError(report, 'security', {
        file: rel,
        message: rule.message,
      })
    }
  }
}

function isIgnoredTokenLine(trimmed, line) {
  if (!trimmed) return true
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.includes('/*')) return true
  if (/data:image\/|url\(|content\s*:/.test(line)) return true
  return false
}

const OFFICIAL_DSW_TOKENS = new Set([
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-primary',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-secondary',
  '--dsw-alias-bg-elevated',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-bg-module-platform',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-primary-inverted',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-border-l1',
  '--dsw-alias-border',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  '--dsw-alias-border-hover',
  '--dsw-alias-brand-primary',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-state-business-tertiary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-status-success',
  '--dsw-alias-label-danger',
  '--dsw-alias-label-warning',
  '--dsw-alias-label-success',
])

function findRawColorViolation(line) {
  const matches = line.match(RAW_COLOR_RE)
  if (!matches) return null
  const filtered = matches.filter((value) => !TRANSPARENT.has(value.toLowerCase()))
  if (filtered.length === 0) return null

  // 严格校验 var(--dsw-*, ...) 回退形式：只有在官方白名单内的 --dsw-* Token 才豁免其 fallback 颜色
  const varMatches = Array.from(line.matchAll(/var\(\s*(--dsw-[a-z0-9_-]+)/g))
  if (varMatches.length > 0) {
    const allValid = varMatches.every((m) => OFFICIAL_DSW_TOKENS.has(m[1]) || m[1].startsWith('--dsw-specific-'))
    if (allValid) return null
  }

  // 杜绝只要行内出现 --dsw- 就盲目放行任何私造变量或裸色
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
