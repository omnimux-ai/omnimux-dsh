import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  escapesRepo,
  parseSkillsIgnoreRules,
  trackedSymlinks,
  verifyAgentsSkillsSymlinks,
} from './verify-agents-skills-symlinks.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * 纯函数式 git 读取器夹具：按参数返回预置输出，不调起子进程。
 * 键为子命令首词，值为 stdout。
 * @param {Record<string, string>} table
 */
function fakeReader(table) {
  return (_root, args) => {
    const key = args.join(' ')
    for (const [prefix, out] of Object.entries(table)) {
      if (key === prefix || key.startsWith(prefix + ' ')) return out
    }
    return ''
  }
}

/** 造一个最小仓库目录：.agents/skills 下若干条目 + .gitignore。 */
function fixture({ entries = {}, gitignore = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'skills-'))
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), gitignore)
  for (const [name, spec] of Object.entries(entries)) {
    const abs = join(root, '.agents', 'skills', name)
    if (spec.type === 'symlink') {
      symlinkSync(spec.target, abs)
    } else {
      mkdirSync(abs, { recursive: true })
      writeFileSync(join(abs, 'SKILL.md'), '# fixture\n')
    }
  }
  return root
}

test('escapesRepo：绝对路径与逃出仓库的相对路径都算逃出', () => {
  const root = '/repo'
  assert.equal(escapesRepo('.agents/skills/x', '/Users/x/OPC/skills/x', root), true)
  // 从 .agents/skills/ 往上两级仍是仓库根，三级才逃出
  assert.equal(escapesRepo('.agents/skills/x', '../../../outside', root), true)
  assert.equal(escapesRepo('.agents/skills/x', '../../outside', root), false)
  assert.equal(escapesRepo('.agents/skills/x', './sibling', root), false)
  assert.equal(escapesRepo('.agents/skills/x', '../skills/y', root), false)
})

test('parseSkillsIgnoreRules：只取 .agents/skills/* 规则，跳过注释与否定', () => {
  const rules = parseSkillsIgnoreRules([
    '# comment',
    'node_modules',
    '.agents/skills/a',
    '.agents/skills/b/',
    '!.agents/skills/c',
    '.agents/other',
  ].join('\n'))
  assert.deepEqual(rules, ['.agents/skills/a', '.agents/skills/b'])
})

test('trackedSymlinks：只返回 mode 120000 的条目并解出其目标', () => {
  const read = fakeReader({
    'ls-files -s -- .agents/skills': [
      '120000 aaaa1111 0\t.agents/skills/link',
      '100644 bbbb2222 0\t.agents/skills/real/SKILL.md',
    ].join('\n'),
    'cat-file -p aaaa1111': '/abs/target\n',
  })
  const links = trackedSymlinks('/fake', '.agents/skills', read)
  assert.equal(links.length, 1)
  assert.equal(links[0].path, '.agents/skills/link')
  assert.equal(links[0].target, '/abs/target')
})

test('失败：跟踪了指向仓外的软链（#3817 排查中发现的真实缺陷）', () => {
  const root = fixture({
    entries: { 'dsh-plugin-dev': { type: 'symlink', target: '/Users/x/Desktop/Project/OPC/资产库/skills/opc-skills-dsh-plugin-dev' } },
  })
  const read = fakeReader({
    'ls-files -s -- .agents/skills': '120000 aaaa1111 0\t.agents/skills/dsh-plugin-dev',
    'cat-file -p aaaa1111': '/Users/x/Desktop/Project/OPC/资产库/skills/opc-skills-dsh-plugin-dev\n',
    'ls-files -- .agents/skills': '.agents/skills/dsh-plugin-dev',
  })
  const { errors } = verifyAgentsSkillsSymlinks(root, read)
  assert.ok(errors.some(e => /指向仓外/.test(e)), errors.join('; '))
  rmSync(root, { recursive: true, force: true })
})

test('通过：仓外软链未入库 + 已写忽略规则', () => {
  const root = fixture({
    entries: { 'dsh-plugin-dev': { type: 'symlink', target: '/abs/skills/dev' } },
    gitignore: '.agents/skills/dsh-plugin-dev\n',
  })
  const read = fakeReader({
    'ls-files -s -- .agents/skills': '',
    'ls-files -- .agents/skills': '',
  })
  const result = verifyAgentsSkillsSymlinks(root, read)
  assert.deepEqual(result.errors, [])
  assert.equal(result.trackedLinks, 0)
  rmSync(root, { recursive: true, force: true })
})

test('通过：忽略规则指向本机不存在的软链（干净 clone / 新 worktree 的正常状态）', () => {
  const root = fixture({ entries: {}, gitignore: '.agents/skills/not-created-yet\n' })
  const read = fakeReader({ 'ls-files -s -- .agents/skills': '', 'ls-files -- .agents/skills': '' })
  const { errors, warnings } = verifyAgentsSkillsSymlinks(root, read)
  assert.deepEqual(errors, [])
  assert.ok(warnings.some(w => /本机不存在/.test(w)))
  rmSync(root, { recursive: true, force: true })
})

test('失败：真实目录被 .gitignore 忽略（仓库自有技能被挡在版本管理外）', () => {
  const root = fixture({
    entries: { 'repo-skill': { type: 'dir' } },
    gitignore: '.agents/skills/repo-skill\n',
  })
  const read = fakeReader({ 'ls-files -s -- .agents/skills': '', 'ls-files -- .agents/skills': '' })
  const { errors } = verifyAgentsSkillsSymlinks(root, read)
  assert.ok(errors.some(e => /真实目录.*必须入库/.test(e)), errors.join('; '))
  rmSync(root, { recursive: true, force: true })
})

test('警告：真实目录技能未入库', () => {
  const root = fixture({ entries: { 'repo-skill': { type: 'dir' } } })
  const read = fakeReader({ 'ls-files -s -- .agents/skills': '', 'ls-files -- .agents/skills': '' })
  const { errors, warnings } = verifyAgentsSkillsSymlinks(root, read)
  assert.deepEqual(errors, [])
  assert.ok(warnings.some(w => /真实目录但未入库/.test(w)))
  rmSync(root, { recursive: true, force: true })
})

test('真实仓库：无跟踪软链，仓库自有技能全部入库', () => {
  const result = verifyAgentsSkillsSymlinks(repoRoot)
  assert.deepEqual(result.errors, [])
  assert.equal(result.trackedLinks, 0)
  assert.ok(result.audited >= 4)
})

test('真实仓库：4 个仓库自有技能以真实目录入库', () => {
  const result = verifyAgentsSkillsSymlinks(repoRoot)
  assert.deepEqual(result.errors, [])
  for (const name of ['omnimux-form-authoring', 'omnimux-rc-upgrade', 'omnimux-repo-workflow', 'tiktok-drama-center']) {
    assert.ok(readFileSync(join(repoRoot, '.agents', 'skills', name, 'SKILL.md'), 'utf8').length > 0, name)
  }
})

test('真实仓库：.gitignore 保留全部仓外软链规则', () => {
  const rules = parseSkillsIgnoreRules(readFileSync(join(repoRoot, '.gitignore'), 'utf8'))
  for (const name of ['short-drama-router', 'dsh-plugin-guide', 'dsh-plugin-dev', 'hallmark']) {
    assert.ok(rules.includes('.agents/skills/' + name), name + ' 应被忽略')
  }
})
