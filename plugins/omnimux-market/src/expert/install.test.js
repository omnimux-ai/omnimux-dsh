import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCatalog, parseCatalog } from './catalog.js'
import { formatMcpRow, installItem, removeMcpRow, spliceManaged, withConnectorPatchLock } from './install.js'

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

function roots() {
  const home = mkdtempSync(join(tmpdir(), 'omx-ins-'))
  const profile = join(home, 'profiles', 'omnimux')
  mkdirSync(profile, { recursive: true })
  return { home, profileDir: profile, packageRoot: PACKAGE_ROOT }
}

test('installs a bundled skill once', () => {
  const env = roots()
  const catalog = loadCatalog()
  const first = installItem({ catalog, id: 'sk-omx-ugc-confessional', ...env })
  const second = installItem({ catalog, id: 'sk-omx-ugc-confessional', ...env })
  assert.equal(first.already, undefined)
  assert.equal(second.already, true)
  assert.equal(existsSync(join(env.home, 'skills', 'ugc-confessional', 'SKILL.md')), true)
})

test('installs a git-source skill from a local fixture remote (no network)', () => {
  // 冷数据：自 013fcb898 起目录不再带 git 技能条目，用合成目录覆盖 git 安装路径。
  // GIT_CONFIG_* 环境变量把 github.com/owner/repo 重写到本地裸仓，全程离线。
  const env = roots()
  const repoDir = join(env.home, 'fixture-repo')
  spawnSync('git', ['init', '-b', 'main', repoDir])
  const skillDir = join(repoDir, 'pack', 'git-skill')
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: git-skill\n---\n\n# Git Skill Fixture\n')
  spawnSync('git', ['-C', repoDir, 'add', '.'])
  spawnSync('git', ['-C', repoDir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init'])
  const catalog = parseCatalog({
    schema: 1,
    generated_at: 'fixture',
    items: [{
      id: 'sk-git-fixture',
      tab: 'skills',
      kind: 'skill',
      title: 'Git Skill',
      summary: 'fixture',
      category: 'fixture',
      skill: 'git-skill',
      source: { type: 'git', repo: 'owner/git-fixture', path: 'pack/git-skill', ref: 'main' },
    }],
  })
  const prev = {
    count: process.env.GIT_CONFIG_COUNT,
    key0: process.env.GIT_CONFIG_KEY_0,
    val0: process.env.GIT_CONFIG_VALUE_0,
  }
  process.env.GIT_CONFIG_COUNT = '1'
  process.env.GIT_CONFIG_KEY_0 = `url.${repoDir}.insteadOf`
  process.env.GIT_CONFIG_VALUE_0 = 'https://github.com/owner/git-fixture.git'
  try {
    const first = installItem({ catalog, id: 'sk-git-fixture', ...env })
    const second = installItem({ catalog, id: 'sk-git-fixture', ...env })
    assert.equal(first.already, undefined)
    assert.equal(first.source, 'git')
    assert.equal(second.already, true)
    const body = readFileSync(join(env.home, 'skills', 'git-skill', 'SKILL.md'), 'utf8')
    assert.match(body, /Git Skill Fixture/)
  } finally {
    for (const [key, name] of [['count', 'GIT_CONFIG_COUNT'], ['key0', 'GIT_CONFIG_KEY_0'], ['val0', 'GIT_CONFIG_VALUE_0']]) {
      if (prev[key] === undefined) delete process.env[name]
      else process.env[name] = prev[key]
    }
  }
})

test('writes an mcp managed block', () => {
  const env = roots()
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), '[]\n')
  const catalog = loadCatalog()
  installItem({ catalog, id: 'cn-tencent-docs', ...env })
  const text = readFileSync(join(env.profileDir, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /omnimux-market managed/)
  assert.match(text, /id: esc-mcp-cn-tencent-docs/)
  assert.match(text, /serverName: tencent-docs/)
})

test('spliceManaged is idempotent for the same row', () => {
  const row = formatMcpRow({
    id: 'github-mcp',
    serverName: 'github',
    source: { type: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'x'] },
  })
  const once = spliceManaged('[]\n', row)
  const twice = spliceManaged(once, row)
  assert.equal(once, twice)
})

test('spliceManaged idempotency survives id prefix collisions', () => {
  // cn-tencent-docs 是 cn-tencent-docs-oa 的 id 前缀：子串匹配会把
  // "写入 docs 行"误判为"docs 行已存在"而跳过
  const rowOa = formatMcpRow({
    id: 'cn-tencent-docs-oa',
    serverName: 'oa',
    source: { type: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'x'] },
  })
  const rowDocs = formatMcpRow({
    id: 'cn-tencent-docs',
    serverName: 'docs',
    source: { type: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'x'] },
  })
  const withOa = spliceManaged('[]\n', rowOa)
  const withBoth = spliceManaged(withOa, rowDocs)
  assert.notEqual(withBoth, withOa)
  assert.match(withBoth, /id: esc-mcp-cn-tencent-docs\n/)
  assert.match(withBoth, /id: esc-mcp-cn-tencent-docs-oa/)
  // 同一行重复写入仍然幂等
  assert.equal(spliceManaged(withBoth, rowDocs), withBoth)
  assert.equal(spliceManaged(withBoth, rowOa), withBoth)
})

test('installing a shorter id is not short-circuited by its longer sibling', () => {
  const env = roots()
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), '[]\n')
  const catalog = loadCatalog()
  installItem({ catalog, id: 'cn-tencent-docs-oa', ...env })
  // docs 不能因 oa 已装（前缀子串误中）被 already 短路
  const docs = installItem({ catalog, id: 'cn-tencent-docs', ...env })
  assert.equal(docs.installed, true)
  assert.equal(docs.already, undefined)
  const text = readFileSync(join(env.profileDir, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /id: esc-mcp-cn-tencent-docs\n/)
  assert.match(text, /id: esc-mcp-cn-tencent-docs-oa/)
  // 各自可独立卸载，互不影响
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  const after = readFileSync(join(env.profileDir, 'cordis.patch.yml'), 'utf8')
  assert.doesNotMatch(after, /id: esc-mcp-cn-tencent-docs\n/)
  assert.match(after, /id: esc-mcp-cn-tencent-docs-oa/)
})

test('rejects unknown ids', () => {
  const env = roots()
  assert.throws(() => installItem({ catalog: loadCatalog(), id: 'nope', ...env }), /unknown item/)
})

test('installs bundled social-engagement-team as a full agent pack, not a flat SKILL.md', () => {
  const env = roots()
  const catalog = loadCatalog()
  const result = installItem({ catalog, id: 'exp-social-engagement-team', ...env })
  assert.equal(result.installed, true)
  assert.equal(result.source, 'bundled')
  const pack = join(env.home, 'skills', 'social-engagement-team')
  assert.equal(existsSync(join(pack, 'SKILL.md')), true)
  assert.equal(existsSync(join(pack, '.codebuddy-plugin', 'plugin.json')), true)
  assert.equal(existsSync(join(pack, 'agents', 'social-engagement-team-lead.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'interaction-automator.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'ai-comment-specialist.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'signal-miner.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'brand-monitor.md')), true)
  const plugin = JSON.parse(readFileSync(join(pack, '.codebuddy-plugin', 'plugin.json'), 'utf8'))
  assert.equal(plugin.expertType, 'team')
  assert.equal(plugin.agentName, 'social-engagement-team-lead')
  assert.deepEqual(plugin.teamInfo.memberAgents, [
    'interaction-automator',
    'ai-comment-specialist',
    'signal-miner',
    'brand-monitor',
  ])
  const lead = readFileSync(join(pack, 'SKILL.md'), 'utf8')
  assert.match(lead, /社媒互动增长专家团 - 主理人/)
  assert.match(lead, /interaction-automator/)
  assert.equal(existsSync(join(env.home, 'skills', 'social-engagement-ops', 'SKILL.md')), true)
  assert.equal(existsSync(join(env.home, 'skills', 'social-engagement-ops', 'references', 'ai-comment-strategy.md')), true)
  const again = installItem({ catalog, id: 'exp-social-engagement-team', ...env })
  assert.equal(again.already, true)
})

test('installs bundled social-content-team as a full multimodal agent pack', () => {
  const env = roots()
  const catalog = loadCatalog()
  const result = installItem({ catalog, id: 'exp-social-content-team', ...env })
  assert.equal(result.installed, true)
  assert.equal(result.source, 'bundled')
  const pack = join(env.home, 'skills', 'social-content-team')
  assert.equal(existsSync(join(pack, 'SKILL.md')), true)
  assert.equal(existsSync(join(pack, '.codebuddy-plugin', 'plugin.json')), true)
  assert.equal(existsSync(join(pack, 'agents', 'social-content-team-lead.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'content-copywriter.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'speech-agent.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'image-agent.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'video-agent.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'music-agent.md')), true)
  assert.equal(existsSync(join(pack, 'agents', 'editing-agent.md')), true)
  assert.equal(existsSync(join(pack, 'contracts', 'anti-loop.md')), true)
  assert.equal(existsSync(join(pack, 'contracts', 'character-ref-guard.md')), true)
  assert.equal(existsSync(join(pack, 'contracts', 'editing-defaults.md')), true)
  assert.equal(existsSync(join(pack, 'contracts', 'canvas-discipline.md')), true)
  assert.equal(existsSync(join(pack, 'contracts', 'output-format.md')), true)
  const plugin = JSON.parse(readFileSync(join(pack, '.codebuddy-plugin', 'plugin.json'), 'utf8'))
  assert.equal(plugin.expertType, 'team')
  assert.equal(plugin.agentName, 'social-content-team-lead')
  assert.deepEqual(plugin.teamInfo.memberAgents, [
    'content-copywriter',
    'speech-agent',
    'image-agent',
    'video-agent',
    'music-agent',
    'editing-agent',
  ])
  const lead = readFileSync(join(pack, 'SKILL.md'), 'utf8')
  assert.match(lead, /社媒多模态内容创作工坊 - 主理人/)
  assert.match(lead, /content-copywriter/)
  assert.match(lead, /editing-agent/)
})

/**
 * 只解析「## 专属绑定技能」小节里的表格行（以 | ` 开头的行），
 * 避免把"严禁越界调用 xxx"的说明文字误判为已绑定技能。
 * @param {string} md
 */
function boundSkills(md) {
  const section = md.split('## 专属绑定技能（Scoped Skills）')[1]?.split('\n## ')[0] ?? ''
  return [...section.matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1])
}

test('subagents bind only their own scoped skills, never the whole catalog', () => {
  const env = roots()
  const catalog = loadCatalog()
  installItem({ catalog, id: 'exp-social-content-team', ...env })
  const pack = join(env.home, 'skills', 'social-content-team')

  const copywriter = readFileSync(join(pack, 'agents', 'content-copywriter.md'), 'utf8')
  const copyBound = boundSkills(copywriter)

  // 文案专员：只绑文案三件套
  assert.deepEqual(copyBound.sort(), ['ad-creative', 'content-strategy', 'social-caption'])
  assert.match(copywriter, /越界调用视觉分镜类技能/)
})

test('installs a local WorkBuddy expert pack without git clone', () => {
  const env = roots()
  const catalog = loadCatalog()
  const result = installItem({ catalog, id: 'exp-ad-creative-strategist', ...env })
  assert.equal(result.installed, true)
  assert.equal(existsSync(join(env.home, 'skills', 'ad-creative-strategist', 'SKILL.md')), true)
  assert.equal(existsSync(join(env.home, 'skills', 'ad-creative-strategist', 'agents', 'ad-creative-strategist.md')), true)
})

test('removeMcpRow keeps other managed rows, the marker pair, and user content', () => {
  const env = roots()
  // 用户手编段（非托管 insert）
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'),
    '- insert:\n    - id: my-local-plugin\n      name: my-local-plugin\n')
  const catalog = loadCatalog()
  installItem({ catalog, id: 'cn-tencent-docs', ...env })
  installItem({ catalog, id: 'cn-notion', ...env })
  const patch = join(env.profileDir, 'cordis.patch.yml')
  assert.match(readFileSync(patch, 'utf8'), /id: esc-mcp-cn-tencent-docs/)
  assert.match(readFileSync(patch, 'utf8'), /id: esc-mcp-cn-notion/)
  // 卸载其中一个：另一行保留，标记对保留，用户段原样
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  const once = readFileSync(patch, 'utf8')
  assert.doesNotMatch(once, /esc-mcp-cn-tencent-docs/)
  assert.match(once, /id: esc-mcp-cn-notion/)
  assert.match(once, /omnimux-market managed/)
  assert.match(once, /id: my-local-plugin/)
  assert.match(once, /name: my-local-plugin/)
})

test('removeMcpRow drops the marker pair and orphan insert header once the managed section is empty', () => {
  const env = roots()
  // 用户手编段 + catalogInstall 写入的托管段
  const initial = '- insert:\n    - id: my-local-plugin\n      name: my-local-plugin\n'
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), initial)
  const catalog = loadCatalog()
  installItem({ catalog, id: 'cn-tencent-docs', ...env })
  const patch = join(env.profileDir, 'cordis.patch.yml')
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  const once = readFileSync(patch, 'utf8')
  // esc-mcp 行消失、标记对与孤立 `- insert:` 行头删除、用户手编段原样：逐字节回到初始内容
  assert.doesNotMatch(once, /esc-mcp-/)
  assert.doesNotMatch(once, /omnimux-market managed/)
  assert.equal(once, initial)
  // 再次调用幂等：文件逐字节不变
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  assert.equal(readFileSync(patch, 'utf8'), once)
  // 文件里不存在的 id 也幂等
  removeMcpRow(env.profileDir, { id: 'cn-notion' })
  assert.equal(readFileSync(patch, 'utf8'), once)
})

test('uninstalling every installed connector restores the patch byte-for-byte', () => {
  const env = roots()
  const initial = '- insert:\n    - id: my-local-plugin\n      name: my-local-plugin\n'
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), initial)
  const catalog = loadCatalog()
  installItem({ catalog, id: 'cn-tencent-docs', ...env })
  installItem({ catalog, id: 'cn-notion', ...env })
  const patch = join(env.profileDir, 'cordis.patch.yml')
  const installed = readFileSync(patch, 'utf8')
  assert.match(installed, /id: esc-mcp-cn-tencent-docs/)
  assert.match(installed, /id: esc-mcp-cn-notion/)
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  // 删一个：另一个还在，标记对还在
  const partial = readFileSync(patch, 'utf8')
  assert.doesNotMatch(partial, /esc-mcp-cn-tencent-docs/)
  assert.match(partial, /id: esc-mcp-cn-notion/)
  assert.match(partial, /omnimux-market managed/)
  removeMcpRow(env.profileDir, { id: 'cn-notion' })
  // 删空：与初始内容逐字节一致
  assert.equal(readFileSync(patch, 'utf8'), initial)
})

test('reinstalling after a full uninstall does not accumulate insert headers', () => {
  const env = roots()
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), '[]\n')
  const catalog = loadCatalog()
  const patch = join(env.profileDir, 'cordis.patch.yml')
  installItem({ catalog, id: 'cn-tencent-docs', ...env })
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  // 空文件场景还原为 spliceManaged 的默认空形态
  assert.equal(readFileSync(patch, 'utf8'), '[]\n')
  installItem({ catalog, id: 'cn-tencent-docs', ...env })
  // 再装回来：`- insert:` 行头只有一个，无累积
  const reinstalled = readFileSync(patch, 'utf8')
  assert.equal((reinstalled.match(/^- insert:$/gm) || []).length, 1)
  assert.match(reinstalled, /id: esc-mcp-cn-tencent-docs/)
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  assert.equal(readFileSync(patch, 'utf8'), '[]\n')
})

test('withConnectorPatchLock serializes concurrent MCP writes', async () => {
  const env = roots()
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), '[]\n')
  const catalog = loadCatalog()
  await Promise.all([
    withConnectorPatchLock(async () => installItem({ catalog, id: 'cn-tencent-docs', ...env })),
    withConnectorPatchLock(async () => installItem({ catalog, id: 'cn-notion', ...env })),
  ])
  const text = readFileSync(join(env.profileDir, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /id: esc-mcp-cn-tencent-docs/)
  assert.match(text, /id: esc-mcp-cn-notion/)
  assert.equal((text.match(/^# --- omnimux-market managed ---$/gm) || []).length, 1)
})

test('removeMcpRow is a no-op without a patch file or without the managed block', () => {
  const env = roots()
  // 文件不存在：无操作、不创建文件
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  assert.equal(existsSync(join(env.profileDir, 'cordis.patch.yml')), false)
  // 只有用户段、没有托管标记对：一个字节都不能动
  const userOnly = '- insert:\n    - id: my-local-plugin\n      name: my-local-plugin\n'
  writeFileSync(join(env.profileDir, 'cordis.patch.yml'), userOnly)
  removeMcpRow(env.profileDir, { id: 'cn-tencent-docs' })
  assert.equal(readFileSync(join(env.profileDir, 'cordis.patch.yml'), 'utf8'), userOnly)
})
