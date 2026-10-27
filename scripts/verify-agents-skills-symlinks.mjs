#!/usr/bin/env node
/**
 * scripts/verify-agents-skills-symlinks.mjs
 *
 * `.agents/skills/` 入库卫生门禁：
 * 1. 仓库不得跟踪指向仓外的软链（绝对路径或逃出仓库的相对路径）——
 *    他人 clone 后必然断链，且会把本机私有布局固化进历史；
 * 2. `.gitignore` 中针对 `.agents/skills/*` 的忽略规则必须对应磁盘上真实存在的条目，
 *    不得留下指向已消失条目的僵尸规则（会误导后来者以为该技能仍被管理）。
 *
 * 约定出处：根 `.gitignore`「本机符号链接，指向仓外 OPC 资产库，仅开发机可用。」
 * 真实目录技能属于仓库自有资产，正常入库，不在本门禁拦截范围内。
 */

import { readFileSync, readdirSync, lstatSync, existsSync, readlinkSync } from 'node:fs'
import { resolve, join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const SKILLS_DIR = '.agents/skills'

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

/**
 * 默认 git 读取器：返回给定参数下的 stdout。
 * 注入点存在是为了让单测用纯函数夹具验证判定逻辑，不必在测试文件里调起子进程。
 * @param {string} root
 * @param {string[]} args
 * @returns {string}
 */
export const defaultGitReader = git

/**
 * 列出仓库内所有被跟踪的软链（mode 120000）。
 * @param {string} root 仓库根
 * @param {string} subdir 限定子目录，默认全仓
 * @param {(root: string, args: string[]) => string} read git 读取器
 * @returns {{ path: string, target: string }[]}
 */
export function trackedSymlinks(root = repoRoot, subdir = '', read = defaultGitReader) {
  const args = ['ls-files', '-s']
  if (subdir) args.push('--', subdir)
  const out = read(root, args)
  const links = []
  for (const line of out.split('\n')) {
    if (!line) continue
    // <mode> <object> <stage>\t<path>
    const [meta, path] = line.split('\t')
    if (!meta || !path) continue
    if (!meta.startsWith('120000')) continue
    let target
    try {
      target = read(root, ['cat-file', '-p', meta.split(' ')[1]]).replace(/\n$/, '')
    } catch {
      continue
    }
    links.push({ path, target })
  }
  return links
}

/**
 * 列出被跟踪的路径（用于盘点真实目录技能是否入库）。
 * @param {string} root
 * @param {string} subdir
 * @param {(root: string, args: string[]) => string} read
 * @returns {Set<string>}
 */
export function trackedPaths(root = repoRoot, subdir = '', read = defaultGitReader) {
  const args = ['ls-files']
  if (subdir) args.push('--', subdir)
  return new Set(read(root, args).split('\n').filter(Boolean))
}

/**
 * 判断软链目标是否逃出仓库。
 * 相对目标按「软链所在目录」解析，再与仓库根比较；绝对目标一律视为逃出。
 * @param {string} linkPath 仓库相对路径
 * @param {string} target 软链内容
 * @param {string} root 仓库根（默认当前工作目录）
 * @returns {boolean}
 */
export function escapesRepo(linkPath, target, root = process.cwd()) {
  if (isAbsolute(target)) return true
  const repoAbs = resolve(root)
  const resolved = resolve(repoAbs, dirname(linkPath), target)
  return resolved !== repoAbs && !resolved.startsWith(repoAbs + '/')
}

/**
 * 解析 `.gitignore` 中针对 `.agents/skills/` 的忽略规则。
 * 只取以 `.agents/skills/` 开头的行，跳过注释与否定规则。
 * @param {string} text
 * @returns {string[]}
 */
export function parseSkillsIgnoreRules(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'))
    .filter(line => line.startsWith(SKILLS_DIR + '/'))
    .map(line => line.replace(/\/+$/, ''))
}

/**
 * 校验 `.agents/skills/` 入库卫生。
 * @param {string} root 仓库根
 * @returns {{ errors: string[], warnings: string[], audited: number, trackedLinks: number, ignoredRules: number }}
 */
export function verifyAgentsSkillsSymlinks(root = repoRoot, read = defaultGitReader) {
  const errors = []
  const warnings = []
  let trackedLinks = 0
  let ignoredRules = 0

  const skillsAbs = join(root, SKILLS_DIR)
  if (!existsSync(skillsAbs)) {
    return { errors: [SKILLS_DIR + ' 目录不存在'], warnings, audited: 0, trackedLinks: 0, ignoredRules: 0 }
  }

  // 检查 1: 不得跟踪指向仓外的软链
  const links = trackedSymlinks(root, SKILLS_DIR, read)
  trackedLinks = links.length
  for (const link of links) {
    if (escapesRepo(link.path, link.target)) {
      errors.push(
        '[' + link.path + '] 被跟踪但指向仓外（' + link.target + '）：他人 clone 后必然断链。' +
        '请 `git rm --cached` 并加入 .gitignore'
      )
    }
  }

  // 检查 2: 忽略规则若对应磁盘上真实存在的条目，该条目必须是软链。
  // 规则指向不存在条目是正常状态：软链是开发机本地便利入口，不进 git，
  // 干净 clone / 新 worktree 上本来就不存在，因此只记 warning 不报错。
  // 真正的问题是「真实目录被忽略」——那会把仓库自有技能挡在版本管理之外。
  const gitignorePath = join(root, '.gitignore')
  if (existsSync(gitignorePath)) {
    const rules = parseSkillsIgnoreRules(readFileSync(gitignorePath, 'utf8'))
    ignoredRules = rules.length
    for (const rule of rules) {
      const abs = join(root, rule)
      if (!existsSync(abs)) {
        warnings.push('[' + rule + '] 忽略规则对应的条目在本机不存在（软链未创建，属正常）')
        continue
      }
      if (!lstatSync(abs).isSymbolicLink()) {
        errors.push(
          '[' + rule + '] 被 .gitignore 忽略但磁盘上是真实目录：仓库自有技能必须入库，' +
          '忽略它会让内容永久留在版本管理之外'
        )
      }
    }
  }

  // 盘点：真实目录技能应入库，仓外软链应被忽略
  const entries = readdirSync(skillsAbs, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.'))
    .map(e => e.name)
  let audited = 0
  const trackedSet = trackedPaths(root, SKILLS_DIR, read)
  for (const name of entries) {
    audited++
    const rel = SKILLS_DIR + '/' + name
    const stat = lstatSync(join(skillsAbs, name))
    const isTracked = [...trackedSet].some(p => p === rel || p.startsWith(rel + '/'))
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(join(skillsAbs, name))
      if (isTracked) {
        errors.push('[' + rel + '] 是软链却被跟踪（目标 ' + target + '）')
      }
    } else if (stat.isDirectory() && !isTracked) {
      warnings.push('[' + rel + '] 是真实目录但未入库：仓库自有技能应入库')
    }
  }

  return { errors, warnings, audited, trackedLinks, ignoredRules }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { errors, warnings, audited, trackedLinks, ignoredRules } = verifyAgentsSkillsSymlinks(repoRoot)
  for (const w of warnings) console.warn('WARN ' + w)
  if (errors.length > 0) {
    for (const e of errors) console.error('ERROR ' + e)
    console.error('\nagents-skills 入库卫生门禁失败：' + errors.length + ' 项错误')
    process.exit(1)
  }
  console.log(
    'agents-skills 入库卫生通过：' + audited + ' 个条目，跟踪软链 ' + trackedLinks +
    ' 个，忽略规则 ' + ignoredRules + ' 条，' + warnings.length + ' 条警告'
  )
}
