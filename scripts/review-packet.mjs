#!/usr/bin/env node
/**
 * scripts/review-packet.mjs
 *
 * 净室评审输入包：把「已提交 diff + 需求原文 + 真实测试证据」三样输入打成一份 Markdown，
 * 交给全新上下文的评审者。协议见 docs/contracts/plugin-git-pr.md「净室评审协议」；
 * 规格见 specs/3848-independent-review-packet.spec.md。
 *
 * 只用 git 与 Node 内置模块；不读会话日志与环境密钥，不联网，不往仓库里写文件。
 * 输入校验：规格与证据必须是 UTF-8 文本（二进制如截图按协议以路径交付）；每份证据必须含当前 head
 * SHA 前 7 位；写出前扫描高置信密钥模式，命中即失败且不回显匹配值。
 * 输出：目录 0700、文件 0600；文件名含输入内容哈希，换证据生成新文件，不覆盖旧包。
 *
 * 用法：
 *   node scripts/review-packet.mjs --spec <path> --evidence <file> [--evidence <file> ...]
 *     [--base <ref>]      默认 origin/main
 *     [--out-dir <dir>]   默认 <os.tmpdir()>/omnimux-review
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BASE = 'origin/main'
export const DEFAULT_OUT_DIR = join(tmpdir(), 'omnimux-review')
export const PACKET_SECTIONS = ['## 需求（规格原文）', '## 改动（diff）', '## 测试证据（原文）', '## 评审要求']
export const HEAD_BINDING_PREFIX = 7
export const HEAD_BINDING_MESSAGE = '证据未绑定当前 head（请在证据中记录 git rev-parse HEAD 的输出）'

/**
 * 高置信密钥模式：只报种类与 文件:行，绝不回显匹配值。
 * 前缀前要求非单词字符或行首（`(?<![A-Za-z0-9_-])`），避免 `task-<sha>`、`risk-…` 这类普通词误报；
 * 主体允许 `-`/`_`，覆盖 sk-proj-…、sk-ant-api03-… 等新格式。
 */
const NOT_WORD_BEFORE = String.raw`(?<![A-Za-z0-9_-])`
export const SECRET_PATTERNS = [
  { kind: 'OpenAI/Anthropic 风格 API key', pattern: new RegExp(`${NOT_WORD_BEFORE}sk-[A-Za-z0-9_-]{20,}`) },
  { kind: 'GitHub token', pattern: new RegExp(`${NOT_WORD_BEFORE}gh[opsur]_[A-Za-z0-9]{30,}`) },
  { kind: 'GitHub fine-grained token', pattern: new RegExp(`${NOT_WORD_BEFORE}github_pat_[A-Za-z0-9_]{20,}`) },
  { kind: 'Google API key', pattern: new RegExp(`${NOT_WORD_BEFORE}AIza[0-9A-Za-z_-]{35}`) },
  { kind: 'AWS access key id', pattern: new RegExp(`${NOT_WORD_BEFORE}(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Z])`) },
  { kind: 'Slack token', pattern: new RegExp(`${NOT_WORD_BEFORE}xox[abpr]-[A-Za-z0-9-]{10,}`) },
  { kind: '私钥', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]

export class ReviewPacketError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ReviewPacketError'
  }
}

const USAGE = '用法：node scripts/review-packet.mjs --spec <path> --evidence <file> [--evidence <file> ...] [--base <ref>] [--out-dir <dir>]'

/** 解析 CLI 参数；未知参数或缺值直接报错。 */
export function parseArgs(argv) {
  const options = { spec: null, evidence: [], base: DEFAULT_BASE, outDir: DEFAULT_OUT_DIR }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1
    const flag = eq === -1 ? raw : raw.slice(0, eq)
    const takeValue = () => {
      if (eq !== -1) return raw.slice(eq + 1)
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new ReviewPacketError(`${flag} 缺少取值。${USAGE}`)
      i += 1
      return value
    }
    if (flag === '--spec') options.spec = takeValue()
    else if (flag === '--evidence') options.evidence.push(takeValue())
    else if (flag === '--base') options.base = takeValue()
    else if (flag === '--out-dir') options.outDir = takeValue()
    else throw new ReviewPacketError(`未知参数：${raw}。${USAGE}`)
  }
  return options
}

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  if (result.error) throw new ReviewPacketError(`无法执行 git ${args.join(' ')}：${result.error.message}`)
  return { status: result.status, stdout: result.stdout ?? '', stderr: (result.stderr ?? '').trim() }
}

function gitOk(cwd, args, failure) {
  const result = git(cwd, args)
  if (result.status !== 0) throw new ReviewPacketError(`${failure}（git ${args.join(' ')}：${result.stderr || `exit ${result.status}`}）`)
  return result.stdout
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

/** 按 Buffer 读取并严格解码；含 NUL 或非法 UTF-8 一律拒绝（二进制证据应以路径交付）。 */
function readRequiredText(path, label) {
  if (!existsSync(path)) throw new ReviewPacketError(`${label}不存在：${path}`)
  if (!statSync(path).isFile()) throw new ReviewPacketError(`${label}不是文件：${path}`)
  let buffer
  try {
    buffer = readFileSync(path)
  } catch (error) {
    throw new ReviewPacketError(`${label}无法读取：${path}（${error.message}）`)
  }
  const binaryHint = `${label}不是 UTF-8 文本：${path}。截图等二进制材料请按净室评审协议以路径交给评审者，不要作为证据文件传入`
  if (buffer.includes(0)) throw new ReviewPacketError(`${binaryHint}（含 NUL 字节）`)
  let text
  try {
    text = strictUtf8.decode(buffer)
  } catch (error) {
    throw new ReviewPacketError(`${binaryHint}（${error.message}）`)
  }
  if (text.trim() === '') throw new ReviewPacketError(`${label}为空：${path}`)
  return text
}

/** 扫描高置信密钥模式；返回 `名称:行 种类` 列表，不含匹配值。 */
export function findSecrets(items) {
  const findings = []
  for (const { name, text } of items) {
    text.split('\n').forEach((line, index) => {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        if (pattern.test(line)) findings.push(`${name}:${index + 1} 疑似${kind}`)
      }
    })
  }
  return findings
}

/**
 * 输入指纹前 8 位：同输入同文件名；换 base、换证据内容或证据名都得到新文件名。
 * 每个字段带长度前缀，避免 ["ab","c"] 与 ["a","bc"] 拼接后相同。
 */
export function inputHash({ baseSha = '', spec, evidence }) {
  const hash = createHash('sha256')
  const field = value => {
    const text = String(value)
    hash.update(`${Buffer.byteLength(text)}:`)
    hash.update(text)
  }
  field(baseSha)
  field(spec.name)
  field(spec.text)
  for (const item of evidence) {
    field(item.name)
    field(item.text)
  }
  return hash.digest('hex').slice(0, 8)
}

/** 取最长已存在前缀做 realpath，再拼回剩余部分，避免 /tmp 等符号链接让「仓库内」判断失真。 */
function realpathLoose(path) {
  let current = resolve(path)
  const rest = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    rest.unshift(basename(current))
    current = parent
  }
  return join(realpathSync(current), ...rest)
}

function isInside(child, parent) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** 比内容里最长的连续反引号多一个，最少三个，保证围栏不被内容提前闭合。 */
export function fenceFor(content) {
  let longest = 0
  for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length)
  return '`'.repeat(Math.max(3, longest + 1))
}

function fenced(content, lang) {
  const fence = fenceFor(content)
  const body = content.endsWith('\n') ? content : `${content}\n`
  return `${fence}${lang}\n${body}${fence}`
}

export function sanitizeBranch(branch) {
  const cleaned = String(branch || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'detached'
}

/** 读取 git 状态：仓库根、分支、base/merge-base/head、已提交 diff 与文件列表。脏工作区直接拒绝。 */
export function collectGitState({ cwd, base }) {
  const top = git(cwd, ['rev-parse', '--show-toplevel'])
  if (top.status !== 0) throw new ReviewPacketError(`当前目录不是 git 仓库：${cwd}`)
  const root = realpathSync(top.stdout.trim())
  const dirty = gitOk(root, ['status', '--porcelain', '--untracked-files=normal'], '无法读取工作区状态').trimEnd()
  if (dirty) {
    throw new ReviewPacketError(`工作区有未提交改动或未忽略的未跟踪文件，评审包必须绑定到一个提交；请先提交或清理：\n${dirty}`)
  }
  const headSha = gitOk(root, ['rev-parse', '--verify', 'HEAD^{commit}'], '无法解析 HEAD').trim()
  const baseSha = gitOk(root, ['rev-parse', '--verify', `${base}^{commit}`], `无法解析 base：${base}`).trim()
  const baseDate = gitOk(root, ['show', '-s', '--format=%cI', baseSha], `无法读取 base 提交时间：${base}`).trim()
  const mergeBase = gitOk(root, ['merge-base', baseSha, headSha], `无法计算 ${base} 与 HEAD 的 merge-base`).trim()
  const branchRaw = gitOk(root, ['rev-parse', '--abbrev-ref', 'HEAD'], '无法读取当前分支').trim()
  const branch = branchRaw === 'HEAD' ? 'detached' : branchRaw
  const range = `${mergeBase}...${headSha}`
  const diff = gitOk(root, ['diff', '--no-color', '--no-ext-diff', '-M', range], '无法生成 diff')
  if (diff.trim() === '') throw new ReviewPacketError(`diff 为空：HEAD ${headSha.slice(0, 12)} 相对 ${base} 的 merge-base 没有已提交改动`)
  const files = gitOk(root, ['diff', '--no-color', '--no-ext-diff', '-M', '--name-status', range], '无法生成改动文件列表')
    .split('\n').filter(Boolean).map(line => line.split('\t'))
  return { root, branch, base, baseSha, baseDate, mergeBase, headSha, diff, files }
}

/** 纯函数：由已收集的输入拼出评审包 Markdown。 */
export function buildPacket({ state, spec, evidence, generatedAt }) {
  const fileLines = state.files.map(([status, ...paths]) => `  - ${status} \`${paths.join('` → `')}\``)
  const evidenceBlocks = evidence.map((item, index) => `### 证据 ${index + 1}：\`${item.name}\`\n\n${fenced(item.text, 'text')}`)
  return [
    `# 评审包 · ${state.branch} @ ${state.headSha.slice(0, 12)}`,
    '',
    `- base：\`${state.base}\`（\`${state.baseSha}\`）`,
    `- base 提交时间：${state.baseDate}`,
    `- merge-base：\`${state.mergeBase}\``,
    `- head：\`${state.headSha}\``,
    `- 分支：\`${state.branch}\``,
    `- 生成日期：${generatedAt}`,
    `- 规格：\`${spec.name}\``,
    `- 改动文件（${state.files.length}）：`,
    ...fileLines,
    '',
    PACKET_SECTIONS[0],
    '',
    fenced(spec.text, 'markdown'),
    '',
    PACKET_SECTIONS[1],
    '',
    fenced(state.diff, 'diff'),
    '',
    PACKET_SECTIONS[2],
    '',
    evidenceBlocks.join('\n\n'),
    '',
    PACKET_SECTIONS[3],
    '',
    '- 你在全新上下文中评审，只依据本包的需求、改动与测试证据（另附 Issue/PR 中的授权范围与风险等级，R0 须为明确授权记录；界面任务另附截图/结构化报告路径）；不要索取或参考实施者的对话、计划或自评。',
    '- 核对项以 docs/contracts/plugin-qa.md「评审与验收结论」为准（实际 diff、测试证据、授权、未解决风险），并补充关注：未验证的假设；未被覆盖的需求条目；不真正执行需求路径也能通过的测试；超出范围的行为改动。',
    '- 每条发现必须包含：问题 / 位置（文件:行）/ 证据 / 严重度（阻断·建议·细节）/ 对应需求条目。',
    `- 结论只对 head \`${state.headSha}\` 有效；head 变化后需重新评审。`,
    '',
  ].join('\n')
}

/** 仓库内显示相对路径；仓库外只显示文件名，不泄露绝对路径。 */
function displayName(path, root) {
  const real = realpathLoose(path)
  return isInside(real, root) ? relative(root, real) : basename(real)
}

/** 校验输入、生成并写出评审包，返回绝对路径。任何缺失都抛 ReviewPacketError。 */
export function createReviewPacket({ cwd = process.cwd(), spec, evidence = [], base = DEFAULT_BASE, outDir = DEFAULT_OUT_DIR, now = new Date() }) {
  if (!spec) throw new ReviewPacketError(`缺少 --spec。${USAGE}`)
  const specPath = resolve(cwd, spec)
  const specText = readRequiredText(specPath, '规格文件')
  if (evidence.length === 0) throw new ReviewPacketError(`缺少 --evidence：评审包必须附真实测试证据。${USAGE}`)
  const evidenceItems = evidence.map(item => {
    const path = resolve(cwd, item)
    return { path, text: readRequiredText(path, '测试证据文件') }
  })
  const state = collectGitState({ cwd, base })
  // 规格必须是 head 中已跟踪的文件（工作区已干净，故内容即 head 版本）；仓库外或被忽略的规格不受提交约束
  const specReal = realpathLoose(specPath)
  if (!isInside(specReal, state.root)) throw new ReviewPacketError(`规格必须是仓库内已提交的文件：${basename(specReal)}`)
  const specRel = relative(state.root, specReal)
  if (git(state.root, ['ls-files', '--error-unmatch', '--', specRel]).status !== 0) {
    throw new ReviewPacketError(`规格未提交到 git（或被忽略）：${specRel}；请先提交规格再生成评审包`)
  }
  const specInput = { name: displayName(specPath, state.root), text: specText }
  const evidenceInputs = evidenceItems.map(item => ({ name: displayName(item.path, state.root), text: item.text }))

  const headPrefix = state.headSha.slice(0, HEAD_BINDING_PREFIX)
  const unbound = evidenceInputs.filter(item => !item.text.includes(headPrefix)).map(item => item.name)
  if (unbound.length > 0) {
    throw new ReviewPacketError(`${HEAD_BINDING_MESSAGE}：${unbound.join('、')} 不含 head ${headPrefix}`)
  }
  const secrets = findSecrets([specInput, ...evidenceInputs])
  if (secrets.length > 0) {
    throw new ReviewPacketError(`规格或证据疑似含密钥，拒绝生成评审包（不回显匹配内容；请删除后重试）：\n${secrets.join('\n')}`)
  }

  const outReal = realpathLoose(resolve(cwd, outDir))
  if (isInside(outReal, state.root)) throw new ReviewPacketError(`--out-dir 不能在仓库内：${outReal}`)
  const markdown = buildPacket({
    state,
    spec: specInput,
    evidence: evidenceInputs,
    generatedAt: now.toISOString().slice(0, 10),
  })
  mkdirSync(outReal, { recursive: true, mode: 0o700 })
  // mkdir 的 mode 只在新建时生效；本工具独占的默认目录若已存在则收紧到 0700。用户自带目录不改其权限。
  if (outReal === realpathLoose(DEFAULT_OUT_DIR)) chmodSync(outReal, 0o700)
  const hash8 = inputHash({ baseSha: state.baseSha, spec: specInput, evidence: evidenceInputs })
  const outPath = join(outReal, `${sanitizeBranch(state.branch)}-${state.headSha.slice(0, 12)}-${hash8}.md`)
  writeFileSync(outPath, markdown, { mode: 0o600 })
  chmodSync(outPath, 0o600)
  return outPath
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  try {
    const options = parseArgs(argv)
    const outPath = createReviewPacket({ cwd, ...options })
    stdout.write(`${outPath}\n`)
    return 0
  } catch (error) {
    const reason = error instanceof ReviewPacketError ? error.message : (error?.stack || String(error))
    stderr.write(`review-packet 失败：${reason}\n`)
    return 1
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main()
}
