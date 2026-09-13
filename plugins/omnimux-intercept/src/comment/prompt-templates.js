/**
 * @file SoPilot 提示词模板读取 + 内置离线兜底模板。
 *
 * **单一真源原则**：SoPilot 提示词只从 `presets/tiktok-agent/skills/sopilot-social-agents/`
 * 运行时按路径读取，**绝不复制进插件**。读不到时回退内置精简模板并写 `TEMPLATE_FALLBACK`，
 * **不抛错**（「功能不断链」是本层的硬要求）。
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本文件所在目录。 */
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（`<repo>/plugins/omnimux-intercept/src/comment` → 上溯 4 层）。 */
export const PROJECT_ROOT = path.resolve(CURRENT_DIR, '../../../..')

/** SoPilot 提示词仓库内相对路径。 */
export const SOPILOT_SKILL_ROOT =
  'presets/tiktok-agent/skills/sopilot-social-agents'

/**
 * 模板种类 → SoPilot 提示词文件名。
 * @type {Readonly<Record<'reply-high' | 'quote', string>>}
 */
export const SOPILOT_PROMPT_FILES = Object.freeze({
  'reply-high': 'ai-tweet-reply-high.sys-prompt.md',
  quote: 'ai-retweet.sys-prompt.md',
})

/**
 * 提示词模板。
 * @typedef {object} PromptTemplate
 * @property {'reply-high' | 'quote'} kind 模板种类
 * @property {string} system 系统提示词
 * @property {'sopilot' | 'builtin'} source 来源（`sopilot` = 仓库既有资产，`builtin` = 内置兜底）
 * @property {string[]} warnings 非致命降级留痕
 */

/** 供 `prompt-builder` 复用的硬性指令（内置模板与外部模板都必须带上同一句话）。 */
export const INFORMATION_VALUE_RULE = '信息增量优先、禁止复述原文'

/**
 * 内置兜底模板（外部资产读不到时使用，保证链路不断）。
 * @type {Readonly<Record<'reply-high' | 'quote', string>>}
 */
export const BUILTIN_TEMPLATES = Object.freeze({
  'reply-high': [
    '你是一位在 X（推特）上深度运营的真实用户，正在为一条高热度推文写评论。',
    '',
    `核心要求：${INFORMATION_VALUE_RULE}。`,
    '- 提供原推没有的新数据、新案例或新视角，而不是把原文换个说法复述一遍。',
    '- 短句为主，最多 2~3 句成段，共 3~5 段，口语、有情绪、有立场。',
    '- 不写营销腔，不堆 hashtag，不出现任何联系方式或引流信息。',
    '- 只输出评论正文本身，不要解释、不要前后缀、不要 Markdown 代码围栏。',
  ].join('\n'),
  quote: [
    '你是一位在 X（推特）上深度运营的真实用户，正在写一条中文引用转发文案。',
    '',
    `核心要求：${INFORMATION_VALUE_RULE}。`,
    '- 用一句话立住自己的判断，再补一个原推没有的信息增量。',
    '- 有观点、有钩子、有情绪，不写「转发一下」「值得一看」这类无信息量的话。',
    '- 不输出 # 标签，不出现任何联系方式或引流信息。',
    '- 只输出引用文案本身，不要解释、不要前后缀、不要 Markdown 代码围栏。',
  ].join('\n'),
})

/**
 * 解析 SoPilot 提示词文件中的「## 系统提示词」小节。
 *
 * 取不到该小节时回退为「去掉 frontmatter 后的全文」。
 * @param {string} content 文件原文
 * @returns {string} 系统提示词正文（已 trim）
 */
export function extractSystemPrompt(content) {
  if (typeof content !== 'string') return ''
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const sections = withoutFrontmatter.split(/^##\s+/m)
  for (const section of sections) {
    const newlineIndex = section.indexOf('\n')
    const title = (newlineIndex === -1 ? section : section.slice(0, newlineIndex)).trim()
    if (title === '系统提示词') {
      return (newlineIndex === -1 ? '' : section.slice(newlineIndex + 1)).trim()
    }
  }
  return withoutFrontmatter.trim()
}

/**
 * 计算 SoPilot 提示词文件的绝对路径。
 * @param {'reply-high' | 'quote'} kind 模板种类
 * @param {Record<string, string | undefined>} [env] 环境变量（可用 `OMNIMUX_REPO_ROOT` 覆盖仓库根）
 * @returns {string}
 */
export function resolveSopilotPromptPath(kind, env = process.env) {
  const override = typeof env?.OMNIMUX_REPO_ROOT === 'string' ? env.OMNIMUX_REPO_ROOT.trim() : ''
  const root = override !== '' ? override : PROJECT_ROOT
  const fileName = SOPILOT_PROMPT_FILES[kind] ?? SOPILOT_PROMPT_FILES['reply-high']
  return path.join(root, SOPILOT_SKILL_ROOT, 'references', 'prompts', fileName)
}

/**
 * 加载提示词模板：优先读 SoPilot 既有资产，失败则回退内置模板。
 *
 * **不抛错**：任何读取/解析失败都降级为内置模板，并在 `warnings` 写 `TEMPLATE_FALLBACK`。
 * @param {'reply-high' | 'quote'} kind 模板种类
 * @param {{
 *   readFile?: (p: string) => Promise<string>,
 *   env?: Record<string, string | undefined>,
 * }} [deps] 注入依赖（默认实现懒加载 `node:fs/promises`，便于真实 CLI 运行）
 * @returns {Promise<PromptTemplate>}
 */
export async function loadPromptTemplate(kind, deps = {}) {
  const resolvedKind = kind === 'quote' ? 'quote' : 'reply-high'
  const builtin = BUILTIN_TEMPLATES[resolvedKind]
  const readFile = typeof deps.readFile === 'function' ? deps.readFile : await defaultReadFile()

  if (typeof readFile === 'function') {
    const filePath = resolveSopilotPromptPath(resolvedKind, deps.env ?? process.env)
    try {
      const content = await readFile(filePath)
      const system = extractSystemPrompt(content)
      if (system !== '') {
        return {
          kind: resolvedKind,
          system,
          source: 'sopilot',
          warnings: [],
        }
      }
    } catch {
      // 落到下面的内置模板分支：读不到不是错误，只是降级。
    }
  }

  return {
    kind: resolvedKind,
    system: builtin,
    source: 'builtin',
    warnings: ['TEMPLATE_FALLBACK'],
  }
}

/**
 * 懒加载 `node:fs/promises`（仅在真实运行且未注入 `readFile` 时触发；单测一律注入假实现）。
 * @returns {Promise<((p: string) => Promise<string>) | null>}
 */
async function defaultReadFile() {
  try {
    const fs = await import('node:fs/promises')
    return (filePath) => fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

/**
 * 同步取内置模板（不读盘，供纯函数路径使用）。
 * @param {'reply-high' | 'reply' | 'quote'} kind 模板种类（`reply` 等价于 `reply-high`）
 * @returns {PromptTemplate}
 */
export function builtinTemplate(kind) {
  const resolvedKind = kind === 'quote' ? 'quote' : 'reply-high'
  return {
    kind: resolvedKind,
    system: BUILTIN_TEMPLATES[resolvedKind],
    source: 'builtin',
    warnings: [],
  }
}
