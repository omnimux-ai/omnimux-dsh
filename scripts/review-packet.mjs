#!/usr/bin/env node
/**
 * scripts/review-packet.mjs
 *
 * 净室评审输入包：把「已提交 diff + 需求原文 + 真实测试证据」三样输入打成一份 Markdown，
 * 交给全新上下文的评审者。协议见 docs/contracts/plugin-git-pr.md「净室评审协议」；
 * 规格见 specs/3848-independent-review-packet.spec.md。
 *
 * 只用 git 与 Node 内置模块；不读会话日志与环境密钥，不联网，不往仓库里写文件。
 *
 * 用法：
 *   node scripts/review-packet.mjs --spec <path> --evidence <file> [--evidence <file> ...]
 *     [--base <ref>]      默认 origin/main
 *     [--out-dir <dir>]   默认 <os.tmpdir()>/omnimux-review
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BASE = 'origin/main'
export const DEFAULT_OUT_DIR = join(tmpdir(), 'omnimux-review')
export const PACKET_SECTIONS = ['## 需求（规格原文）', '## 改动（diff）', '## 测试证据（原文）', '## 评审要求']

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

function readRequiredText(path, label) {
  if (!existsSync(path)) throw new ReviewPacketError(`${label}不存在：${path}`)
  if (!statSync(path).isFile()) throw new ReviewPacketError(`${label}不是文件：${path}`)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new ReviewPacketError(`${label}无法读取：${path}（${error.message}）`)
  }
  if (text.trim() === '') throw new ReviewPacketError(`${label}为空：${path}`)
  return text
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
  const mergeBase = gitOk(root, ['merge-base', baseSha, headSha], `无法计算 ${base} 与 HEAD 的 merge-base`).trim()
  const branchRaw = gitOk(root, ['rev-parse', '--abbrev-ref', 'HEAD'], '无法读取当前分支').trim()
  const branch = branchRaw === 'HEAD' ? 'detached' : branchRaw
  const range = `${mergeBase}...${headSha}`
  const diff = gitOk(root, ['diff', '--no-color', '--no-ext-diff', '-M', range], '无法生成 diff')
  if (diff.trim() === '') throw new ReviewPacketError(`diff 为空：HEAD ${headSha.slice(0, 12)} 相对 ${base} 的 merge-base 没有已提交改动`)
  const files = gitOk(root, ['diff', '--no-color', '--no-ext-diff', '-M', '--name-status', range], '无法生成改动文件列表')
    .split('\n').filter(Boolean).map(line => line.split('\t'))
  return { root, branch, base, baseSha, mergeBase, headSha, diff, files }
}

/** 纯函数：由已收集的输入拼出评审包 Markdown。 */
export function buildPacket({ state, spec, evidence, generatedAt }) {
  const fileLines = state.files.map(([status, ...paths]) => `  - ${status} \`${paths.join('` → `')}\``)
  const evidenceBlocks = evidence.map((item, index) => `### 证据 ${index + 1}：\`${item.name}\`\n\n${fenced(item.text, 'text')}`)
  return [
    `# 评审包 · ${state.branch} @ ${state.headSha.slice(0, 12)}`,
    '',
    `- base：\`${state.base}\`（\`${state.baseSha}\`）`,
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
    '- 你在全新上下文中评审，只依据本包的需求、改动与测试证据；不要索取或参考实施者的对话、计划或自评。',
    '- 重点：未验证的假设；未被覆盖的需求条目；不真正执行需求路径也能通过的测试；超出范围的行为改动。',
    '- 每条发现必须包含：问题 / 位置（文件:行）/ 证据 / 严重度（阻断·建议·细节）/ 对应需求条目。',
    `- 结论只对 head \`${state.headSha}\` 有效；head 变化后需重新评审。`,
    '',
  ].join('\n')
}

function displayName(path, root) {
  const real = realpathLoose(path)
  return isInside(real, root) ? relative(root, real) : real
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
  const outReal = realpathLoose(resolve(cwd, outDir))
  if (isInside(outReal, state.root)) throw new ReviewPacketError(`--out-dir 不能在仓库内：${outReal}`)
  const markdown = buildPacket({
    state,
    spec: { name: displayName(specPath, state.root), text: specText },
    evidence: evidenceItems.map(item => ({ name: displayName(item.path, state.root), text: item.text })),
    generatedAt: now.toISOString().slice(0, 10),
  })
  mkdirSync(outReal, { recursive: true })
  const outPath = join(outReal, `${sanitizeBranch(state.branch)}-${state.headSha.slice(0, 12)}.md`)
  writeFileSync(outPath, markdown)
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
