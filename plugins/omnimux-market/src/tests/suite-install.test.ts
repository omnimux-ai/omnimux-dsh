/**
 * @file plugins/omnimux-market/src/tests/suite-install.test.ts
 * 套件一键安装链路：三样落盘、幂等、托管段逐字节还原、失败项回传、路由与门禁。
 * 全程只写临时 DSH_HOME / 临时工作区，不碰真实 ~/.dsh。
 */

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { withDefaults } from '../config-store.js'
import { handleApi, MUTATING_METHODS } from '../local-api.js'
import {
  dropSuiteRules,
  findProjectRoot,
  installSuite,
  spliceSuiteRules,
  suiteRuleBegin,
  suiteRuleEnd,
  uninstallSuite,
  type SuiteItem,
} from '../suite-install.js'

/* ------------------------------------------------------------------ 夹具 */

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

interface Fixture {
  home: string
  projectRoot: string
  workspace: string
  packRoot: string
  item: SuiteItem
}

/** 造一个自包含套件包：skills/ + contracts/ + agents/，套件条目手写在测试里。 */
function fixture(extra: { skills?: string[], rules?: string[], agents?: string[] } = {}): Fixture {
  const home = tempDir('omx-suite-home-')
  const projectRoot = tempDir('omx-suite-proj-')
  mkdirSync(join(projectRoot, '.git'), { recursive: true })
  const workspace = join(projectRoot, 'packages', 'app')
  mkdirSync(workspace, { recursive: true })
  const packRoot = tempDir('omx-suite-pack-')
  const packDir = join(packRoot, 'experts', 'demo-pack')
  mkdirSync(join(packDir, 'agents'), { recursive: true })
  mkdirSync(join(packDir, 'contracts'), { recursive: true })

  const skills = extra.skills ?? ['skill-a', 'skill-b']
  for (const name of skills) {
    mkdirSync(join(packDir, 'skills', name), { recursive: true })
    writeFileSync(join(packDir, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n\n# ${name}\n`)
  }
  const rules = extra.rules ?? ['rule-a', 'rule-b']
  for (const name of rules) {
    writeFileSync(
      join(packDir, 'contracts', `${name}.md`),
      `---\nname: ${name}\nagents: [demo-agent]\n---\n\n# ${name} 契约\n\n${name} 的正文。\n`,
    )
  }
  const agents = extra.agents ?? ['demo-agent', 'second-agent']
  for (const name of agents) {
    writeFileSync(
      join(packDir, 'agents', `${name}.md`),
      `---\nname: ${name}\ndescription: ${name} 的说明\ndisplayName:\n  zh: ${name} 中文名\nmaxTurns: 50\n---\n\n# ${name} 人格\n\n你是 ${name}。\n`,
    )
  }

  const item: SuiteItem = {
    id: 'suite-demo',
    kind: 'suite',
    skill: 'demo-pack',
    title: '演示套件',
    summary: '夹具套件',
    source: { type: 'bundled', path: 'experts/demo-pack' },
    suite: {
      skills: skills.map((name) => ({ name, title: name, desc: `${name} 说明` })),
      rules: rules.map((name) => ({ name, title: `${name} 标题`, desc: `${name} 说明` })),
      agents: agents.map((name) => ({ name, title: `${name} 角色`, desc: `${name} 说明` })),
    },
  }
  return { home, projectRoot, workspace, packRoot, item }
}

function install(fx: Fixture, opts: { ruleTarget?: 'project' | 'global' } = {}) {
  return installSuite({
    catalog: { items: [fx.item] },
    item: fx.item,
    home: fx.home,
    profileDir: join(fx.home, 'profiles', 'omnimux'),
    packageRoot: fx.packRoot,
    ruleTarget: opts.ruleTarget ?? 'project',
    projectDir: fx.projectRoot,
  })
}

/* ------------------------------------------------------- 托管段纯函数语义 */

test('spliceSuiteRules 追加托管段后能逐字节还原，覆盖各种文件结尾', () => {
  const variants = ['', 'A', 'A\n', 'A\n\n', '# 用户规则\n\n- 手写一条\n']
  for (const initial of variants) {
    const once = spliceSuiteRules(initial, 'suite-demo', '### 规则甲')
    assert.notEqual(once, initial, `空变体 ${JSON.stringify(initial)} 应被写入`)
    // 幂等：同样的内容再写一次，一个字节都不变
    assert.equal(spliceSuiteRules(once, 'suite-demo', '### 规则甲'), once)
    // 段外内容原样保留
    if (initial) assert.ok(once.startsWith(initial), `段外内容被改动: ${JSON.stringify(initial)}`)
    assert.ok(once.includes(suiteRuleBegin('suite-demo')))
    assert.ok(once.includes(suiteRuleEnd('suite-demo')))
    // 卸载逐字节还原
    assert.equal(dropSuiteRules(once, 'suite-demo'), initial)
  }
})

test('spliceSuiteRules 内容变化时整段替换，dropSuiteRules 对不存在的段幂等', () => {
  const once = spliceSuiteRules('用户段落\n', 'suite-demo', '### 旧内容')
  const twice = spliceSuiteRules(once, 'suite-demo', '### 新内容')
  assert.ok(twice.includes('### 新内容'))
  assert.doesNotMatch(twice, /### 旧内容/)
  assert.equal(dropSuiteRules(twice, 'suite-demo'), '用户段落\n')
  assert.equal(dropSuiteRules('原样文件\n', 'suite-demo'), '原样文件\n')
})

test('同文件多个套件段互不影响：摘掉一个，另一个逐字节可还原', () => {
  const base = '用户手写\n'
  const a = spliceSuiteRules(base, 'suite-a', 'A 的规则')
  const ab = spliceSuiteRules(a, 'suite-b', 'B 的规则')
  const onlyB = dropSuiteRules(ab, 'suite-a')
  assert.doesNotMatch(onlyB, /suite-a/)
  assert.equal(onlyB, spliceSuiteRules(base, 'suite-b', 'B 的规则'))
  assert.equal(dropSuiteRules(onlyB, 'suite-b'), base)
})

test('findProjectRoot 自子目录上溯命中 .git，无标记时回落起始目录', () => {
  const root = tempDir('omx-projroot-')
  mkdirSync(join(root, '.git'), { recursive: true })
  const deep = join(root, 'a', 'b')
  mkdirSync(deep, { recursive: true })
  assert.deepEqual(findProjectRoot(deep), { root, matched: true })
  const bare = tempDir('omx-bare-')
  assert.deepEqual(findProjectRoot(bare), { root: bare, matched: false })
})

/* ------------------------------------------------------------ 三样装到位 */

test('一次安装把技能、规则、Agent 都装到位', () => {
  const fx = fixture()
  const result = install(fx)

  // 技能摊平进技能库
  assert.equal(result.skills.installed, 2)
  assert.equal(result.skills.failed, 0)
  for (const name of ['skill-a', 'skill-b']) {
    assert.equal(existsSync(join(fx.home, 'skills', name, 'SKILL.md')), true, name)
  }
  // 规则写进项目 AGENTS.md
  assert.equal(result.rules.written, 2)
  assert.equal(result.rules.target, 'project')
  assert.equal(result.rules.file, join(fx.projectRoot, 'AGENTS.md'))
  const agentsMd = readFileSync(join(fx.projectRoot, 'AGENTS.md'), 'utf8')
  assert.match(agentsMd, /### rule-a 标题/)
  assert.match(agentsMd, /rule-a 的正文/)
  assert.match(agentsMd, /### rule-b 标题/)
  // Agent 落成 preset
  assert.equal(result.agents.installed, 2)
  const preset = join(fx.home, '.agent-presets', 'demo-pack-demo-agent')
  assert.equal(existsSync(join(preset, 'preset.yml')), true)
  const cordis = readFileSync(join(preset, 'agent.cordis.yml'), 'utf8')
  // persona 取 agent 文件正文（frontmatter 不进 persona）
  assert.match(cordis, /# demo-agent 人格/)
  assert.doesNotMatch(cordis, /displayName/)
  assert.match(readFileSync(join(preset, 'preset.yml'), 'utf8'), /name: demo-agent 角色/)
  // 结果回执
  assert.equal(result.partial, false)
  assert.equal(result.failed.length, 0)
  assert.equal(result.pack.skill, 'demo-pack')
})

test('规则写入个人全局时落 $DSH_HOME/AGENTS.md', () => {
  const fx = fixture()
  const result = install(fx, { ruleTarget: 'global' })
  assert.equal(result.rules.target, 'global')
  assert.equal(result.rules.file, join(fx.home, 'AGENTS.md'))
  assert.equal(existsSync(join(fx.home, 'AGENTS.md')), true)
  assert.equal(existsSync(join(fx.projectRoot, 'AGENTS.md')), false)
})

test('重复安装幂等：不重复追加规则、不重复复制技能、不重复注册 Agent', () => {
  const fx = fixture()
  // 项目里先有用户手写内容
  const initial = '# 我的项目\n\n- 手写规则一条\n'
  writeFileSync(join(fx.projectRoot, 'AGENTS.md'), initial)

  const first = install(fx)
  assert.equal(first.already, false)
  const afterFirst = readFileSync(join(fx.projectRoot, 'AGENTS.md'), 'utf8')
  const presetAfter = readFileSync(join(fx.home, '.agent-presets', 'demo-pack-demo-agent', 'agent.cordis.yml'), 'utf8')

  const second = install(fx)
  assert.equal(second.already, true)
  assert.equal(second.partial, false)
  assert.equal(second.skills.installed, 0)
  assert.equal(second.skills.already, 2)
  assert.equal(second.rules.written, 0)
  assert.equal(second.rules.already, 2)
  assert.equal(second.agents.installed, 0)
  assert.equal(second.agents.already, 2)
  // 文件逐字节不变
  assert.equal(readFileSync(join(fx.projectRoot, 'AGENTS.md'), 'utf8'), afterFirst)
  assert.equal(readFileSync(join(fx.home, '.agent-presets', 'demo-pack-demo-agent', 'agent.cordis.yml'), 'utf8'), presetAfter)
  // 用户内容仍在
  assert.match(afterFirst, /# 我的项目/)
})

/* ------------------------------------------------ 卸载与逐字节还原 */

test('卸载：托管段逐字节还原、preset 删除、技能按既有卸载语义删除', async () => {
  const fx = fixture()
  const initial = '# 我的项目\n\n- 手写规则一条\n'
  const agentsFile = join(fx.projectRoot, 'AGENTS.md')
  writeFileSync(agentsFile, initial)

  install(fx)
  assert.notEqual(readFileSync(agentsFile, 'utf8'), initial)

  const result = await uninstallSuite({ item: fx.item, home: fx.home, projectDir: fx.projectRoot })
  assert.equal(readFileSync(agentsFile, 'utf8'), initial)
  assert.equal(result.rules.items.some((it) => it.target === 'project' && it.status === 'removed'), true)
  assert.equal(existsSync(join(fx.home, '.agent-presets', 'demo-pack-demo-agent')), false)
  assert.equal(existsSync(join(fx.home, '.agent-presets', 'demo-pack-second-agent')), false)
  assert.equal(result.agents.removed, 2)
  assert.equal(existsSync(join(fx.home, 'skills', 'skill-a')), false)
  assert.equal(existsSync(join(fx.home, 'skills', 'demo-pack')), false)
  assert.equal(result.skills.removed, 3)

  // 二次卸载幂等：什么都不剩，也不抛错
  const again = await uninstallSuite({ item: fx.item, home: fx.home, projectDir: fx.projectRoot })
  assert.equal(again.skills.removed, 0)
  assert.equal(again.agents.removed, 0)
  assert.equal(readFileSync(agentsFile, 'utf8'), initial)
})

test('卸载：安装前不存在的 AGENTS.md 会被清掉，不留空文件', async () => {
  const fx = fixture()
  const agentsFile = join(fx.projectRoot, 'AGENTS.md')
  assert.equal(existsSync(agentsFile), false)
  install(fx)
  assert.equal(existsSync(agentsFile), true)
  await uninstallSuite({ item: fx.item, home: fx.home, projectDir: fx.projectRoot })
  assert.equal(existsSync(agentsFile), false)
})

/* -------------------------------------------------------- 失败项回传 */

test('单环节失败：失败项带原因回传，已成功项不回滚', () => {
  const fx = fixture({ skills: ['skill-a'], rules: ['rule-a'], agents: ['demo-agent'] })
  // 目录文档声称有、包内实际没有的三样
  fx.item.suite = {
    skills: [
      { name: 'skill-a', title: 'skill-a', desc: '' },
      { name: 'ghost-skill', title: 'ghost-skill', desc: '' },
    ],
    rules: [
      { name: 'rule-a', title: 'rule-a 标题', desc: '' },
      { name: 'ghost-rule', title: 'ghost-rule', desc: '' },
    ],
    agents: [
      { name: 'demo-agent', title: 'demo-agent', desc: '' },
      { name: 'ghost-agent', title: 'ghost-agent', desc: '' },
    ],
  }
  const result = install(fx)

  assert.equal(result.partial, true)
  assert.deepEqual(
    result.failed.map((f) => `${f.part}:${f.name}`).sort(),
    ['agents:ghost-agent', 'rules:ghost-rule', 'skills:ghost-skill'],
  )
  for (const failure of result.failed) assert.match(failure.error, /包内缺少/)
  // 成功项照常落盘，不回滚
  assert.equal(existsSync(join(fx.home, 'skills', 'skill-a', 'SKILL.md')), true)
  assert.match(readFileSync(join(fx.projectRoot, 'AGENTS.md'), 'utf8'), /rule-a 的正文/)
  assert.equal(existsSync(join(fx.home, '.agent-presets', 'demo-pack-demo-agent', 'preset.yml')), true)
  assert.equal(result.already, false)
  // 未完成项在结果里可数
  assert.equal(result.skills.failed, 1)
  assert.equal(result.rules.failed, 1)
  assert.equal(result.agents.failed, 1)
})

test('规则名带路径字符时拒绝写入，不落到目录外', () => {
  const fx = fixture({ rules: ['rule-a'] })
  fx.item.suite = {
    skills: [],
    rules: [
      { name: 'rule-a', title: 'rule-a', desc: '' },
      { name: '../escape', title: '逃逸', desc: '' },
    ],
    agents: [],
  }
  const result = install(fx)
  assert.equal(result.rules.failed, 1)
  assert.equal(result.failed[0].name, '../escape')
  assert.match(result.failed[0].error, /非法/)
  assert.equal(existsSync(join(fx.projectRoot, 'AGENTS.md')), true)
})

test('没有显式工作区时规则环节失败并回传原因（绝不落到进程 cwd）', () => {
  const fx = fixture()
  const bare = tempDir('omx-nowhere-') // 不显式指定工作区
  const previous = process.cwd()
  process.chdir(bare)
  try {
    const result = installSuite({
      catalog: { items: [fx.item] },
      item: fx.item,
      home: fx.home,
      profileDir: join(fx.home, 'profiles', 'omnimux'),
      packageRoot: fx.packRoot,
    })
    assert.equal(result.rules.written, 0)
    assert.equal(result.rules.failed, 2)
    assert.match(result.failed.find((f) => f.part === 'rules')?.error || '', /未指定工作区目录/)
    // 技能与 Agent 不受规则环节影响
    assert.equal(result.skills.installed, 2)
    assert.equal(result.agents.installed, 2)
    assert.equal(existsSync(join(bare, 'AGENTS.md')), false)
  } finally {
    process.chdir(previous)
  }
})

test('工作区向上没有 .git 标记时，按平台语义落在该目录自身的 AGENTS.md', () => {
  const fx = fixture()
  const plain = tempDir('omx-plain-') // 普通文件夹：非 git 项目
  const result = installSuite({
    catalog: { items: [fx.item] },
    item: fx.item,
    home: fx.home,
    profileDir: join(fx.home, 'profiles', 'omnimux'),
    packageRoot: fx.packRoot,
    ruleTarget: 'project',
    projectDir: plain,
  })
  assert.equal(result.rules.written, 2)
  assert.equal(result.rules.projectRoot, plain)
  assert.equal(existsSync(join(plain, 'AGENTS.md')), true)
})

/* ---------------------------------------------------------- 真实数据链路 */

test('真实套件 suite-social-content-team：装 5 条规则 + 7 个 Agent', async () => {
  const home = tempDir('omx-suite-real-')
  const projectRoot = tempDir('omx-suite-realproj-')
  mkdirSync(join(projectRoot, '.git'), { recursive: true })
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const cfg = withDefaults({})
    const installRes = await callApi('suiteInstall', { id: 'suite-social-content-team', ruleTarget: 'project', projectDir: projectRoot }, cfg)
    assert.equal(installRes.status, 200)
    assert.equal(installRes.json.ok, true)
    assert.equal(installRes.json.agents.installed, 7)
    assert.equal(installRes.json.rules.written, 5)
    assert.equal(installRes.json.partial, false)
    // 规则落点在显式选择的项目根
    assert.equal(installRes.json.rules.file, join(projectRoot, 'AGENTS.md'))
    const agentsMd = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8')
    assert.match(agentsMd, /## 套件规则 · 社媒多模态内容创作工坊/)
    assert.match(agentsMd, /失败处理由错误类型、可恢复性、成本和新增信息决定/)
    assert.equal(existsSync(join(home, '.agent-presets', 'social-content-team-content-copywriter', 'agent.cordis.yml')), true)
    assert.match(readFileSync(join(home, '.agent-presets', 'social-content-team-content-copywriter', 'agent.cordis.yml'), 'utf8'), /社媒文案专员/)
    // 整包也落进技能库（后续会话能一层发现）
    assert.equal(existsSync(join(home, 'skills', 'social-content-team', 'SKILL.md')), true)

    // 重复安装：already 语义，文件不动
    const before = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8')
    const again = await callApi('suiteInstall', { id: 'suite-social-content-team', projectDir: projectRoot }, cfg)
    assert.equal(again.json.already, true)
    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), before)

    // 卸载：托管段摘干净，preset 删除
    const removed = await callApi('suiteUninstall', { id: 'suite-social-content-team', projectDir: projectRoot }, cfg)
    assert.equal(removed.status, 200)
    assert.equal(removed.json.rules.items.find((it: any) => it.target === 'project').status, 'removed')
    assert.equal(existsSync(join(home, '.agent-presets', 'social-content-team-content-copywriter')), false)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

/* ------------------------------------------------------------ 路由与门禁 */

test('suiteInstall / suiteUninstall 进 MUTATING_METHODS，非 POST 一律 405', async () => {
  assert.equal(MUTATING_METHODS.has('suiteInstall'), true)
  assert.equal(MUTATING_METHODS.has('suiteUninstall'), true)
  const cfg = withDefaults({})
  for (const method of ['suiteInstall', 'suiteUninstall']) {
    const res = await callApi(method, {}, cfg, { httpMethod: 'GET', origin: 'http://127.0.0.1:3080' })
    assert.equal(res.status, 405, method)
  }
})

test('suiteInstall 跨站来源 403，未知 id / 非套件条目 400', async () => {
  const cfg = withDefaults({})
  const cross = await callApi('suiteInstall', { id: 'suite-social-content-team' }, cfg, { origin: 'http://evil.example' })
  assert.equal(cross.status, 403)

  const same = await callApi('suiteInstall', { id: 'suite-nope' }, cfg)
  assert.equal(same.status, 400)
  assert.match(same.json.error, /unknown item/)

  const notSuite = await callApi('suiteInstall', { id: 'exp-social-content-team' }, cfg)
  assert.equal(notSuite.status, 400)
  assert.match(notSuite.json.error, /not a suite/)
})

test('未知套件卸载 400，卸载缺失的套件不抛错', async () => {
  const home = tempDir('omx-suite-uninstall-')
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const cfg = withDefaults({})
    const unknown = await callApi('suiteUninstall', { id: 'suite-nope' }, cfg)
    assert.equal(unknown.status, 400)
    const missing = await callApi('suiteUninstall', { id: 'suite-social-content-team' }, cfg)
    assert.equal(missing.status, 200)
    assert.equal(missing.json.ok, true)
    assert.equal(missing.json.agents.removed, 0)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

/* ------------------------------------------- 平铺多技能仓库（Issue #1685） */

/**
 * 造一个「平铺多技能仓库」包：技能直接躺在包根之下，没有 `skills/` 中间层，
 * 清单项靠可选的 `path` 定位。`paths` 可让某个技能落在多级子目录里。
 */
function flatFixture(extra: { skills?: string[], paths?: Record<string, string> } = {}): Fixture {
  const home = tempDir('omx-flat-home-')
  const projectRoot = tempDir('omx-flat-proj-')
  mkdirSync(join(projectRoot, '.git'), { recursive: true })
  const packRoot = tempDir('omx-flat-pack-')
  const packDir = join(packRoot, 'experts', 'flat-pack')
  const skills = extra.skills ?? ['flat-a', 'flat-b', 'flat-c']
  const relOf = (name: string) => extra.paths?.[name] ?? name
  for (const name of skills) {
    mkdirSync(join(packDir, relOf(name)), { recursive: true })
    writeFileSync(
      join(packDir, relOf(name), 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name}\n---\n\n# ${name}\n`,
    )
  }
  const item: SuiteItem = {
    id: 'suite-flat',
    kind: 'suite',
    skill: 'flat-pack',
    title: '平铺套件',
    summary: '平铺夹具套件',
    source: { type: 'bundled', path: 'experts/flat-pack' },
    suite: {
      skills: skills.map((name) => ({ name, title: name, desc: `${name} 说明`, path: relOf(name) })),
      rules: [],
      agents: [],
    },
  }
  return { home, projectRoot, workspace: projectRoot, packRoot, item }
}

test('清单项带 path 时从 <包根>/<path>/ 平铺装载，落点仍是技能库根', () => {
  const fx = flatFixture()
  const result = install(fx)

  assert.equal(result.skills.total, 3)
  assert.equal(result.skills.installed, 3)
  assert.equal(result.skills.failed, 0)
  assert.equal(result.partial, false)
  assert.equal(result.already, false)
  for (const name of ['flat-a', 'flat-b', 'flat-c']) {
    assert.equal(existsSync(join(fx.home, 'skills', name, 'SKILL.md')), true, `${name} 未落盘`)
    assert.match(readFileSync(join(fx.home, 'skills', name, 'SKILL.md'), 'utf8'), new RegExp(`# ${name}`))
  }
  // 平铺装载不改写包自身：包根下仍是原样目录
  assert.equal(existsSync(join(fx.home, 'skills', 'flat-pack', 'flat-a', 'SKILL.md')), true)
  // 规则 / Agent 为空 → 不产生任何写入
  assert.equal(result.rules.total, 0)
  assert.equal(result.rules.written, 0)
  assert.equal(result.agents.total, 0)
  assert.equal(existsSync(join(fx.projectRoot, 'AGENTS.md')), false)
  assert.equal(existsSync(join(fx.home, '.agent-presets')), false)
})

test('path 支持多级子目录，落点仍按技能名摊平', () => {
  const fx = flatFixture({ skills: ['deep-a'], paths: { 'deep-a': 'tools/deep/deep-a' } })
  const result = install(fx)
  assert.equal(result.skills.installed, 1)
  assert.equal(existsSync(join(fx.home, 'skills', 'deep-a', 'SKILL.md')), true)
  assert.equal(existsSync(join(fx.home, 'skills', 'tools')), false)
})

test('带 path 与不带 path 的清单项可在同一个套件里并存', () => {
  const fx = flatFixture({ skills: ['flat-a'] })
  // 第二个技能沿用旧语义：<包根>/skills/<name>/
  const nested = join(fx.packRoot, 'experts', 'flat-pack', 'skills', 'nested-b')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, 'SKILL.md'), '---\nname: nested-b\ndescription: nested-b\n---\n\n# nested-b\n')
  fx.item.suite = {
    skills: [
      { name: 'flat-a', title: 'flat-a', desc: '平铺项', path: 'flat-a' },
      { name: 'nested-b', title: 'nested-b', desc: '旧语义项' },
    ],
    rules: [],
    agents: [],
  }

  const result = install(fx)
  assert.equal(result.skills.installed, 2)
  assert.equal(result.skills.failed, 0)
  assert.equal(existsSync(join(fx.home, 'skills', 'flat-a', 'SKILL.md')), true)
  assert.equal(existsSync(join(fx.home, 'skills', 'nested-b', 'SKILL.md')), true)
})

test('平铺装载幂等：重复安装第二次全部 already，不再写入', () => {
  const fx = flatFixture()
  const first = install(fx)
  assert.equal(first.skills.installed, 3)
  const second = install(fx)
  assert.equal(second.skills.installed, 0)
  assert.equal(second.skills.already, 3)
  assert.equal(second.already, true)
  assert.equal(second.partial, false)
})

test('不安全的 path 被拒并记失败，不落盘也不越界读取', () => {
  const fx = flatFixture({ skills: ['escape-a'], paths: { 'escape-a': 'escape-a' } })
  for (const bad of ['../outside', '/etc', 'a/../../b', 'a//b']) {
    const item: SuiteItem = {
      ...fx.item,
      id: `suite-flat-${bad.replace(/[^a-z]/g, '')}`,
      suite: { skills: [{ name: 'escape-a', title: '越界', desc: '越界项', path: bad }], rules: [], agents: [] },
    }
    const result = installSuite({
      catalog: { items: [item] },
      item,
      home: tempDir('omx-flat-bad-'),
      profileDir: join(fx.home, 'profiles', 'omnimux'),
      packageRoot: fx.packRoot,
      ruleTarget: 'project',
      projectDir: fx.projectRoot,
    })
    assert.equal(result.skills.installed, 0, `path=${bad} 不应落盘`)
    assert.equal(result.skills.failed, 1, `path=${bad} 应记失败`)
    assert.equal(result.partial, true)
    assert.match(String(result.failed[0].error), /path 非法/)
  }
  assert.equal(existsSync(join(fx.home, 'outside')), false)
})

test('带 path 缺 SKILL.md 时失败文案指向该 path，缺省项仍指向 skills/<name>', () => {
  const fx = flatFixture({ skills: ['ghost-a'], paths: { 'ghost-a': 'ghost-a' } })
  const item: SuiteItem = {
    ...fx.item,
    suite: {
      skills: [
        { name: 'ghost-a', title: '缺源', desc: '带 path 但无 SKILL.md', path: 'missing-dir' },
        { name: 'ghost-b', title: '缺源旧语义', desc: '无 path 且包内没有 skills/' },
      ],
      rules: [],
      agents: [],
    },
  }
  const result = installSuite({
    catalog: { items: [item] },
    item,
    home: fx.home,
    profileDir: join(fx.home, 'profiles', 'omnimux'),
    packageRoot: fx.packRoot,
    ruleTarget: 'project',
    projectDir: fx.projectRoot,
  })
  assert.equal(result.skills.installed, 0)
  assert.equal(result.skills.failed, 2)
  const errors = result.failed.map((row) => row.error).join('\n')
  assert.match(errors, /包内缺少 missing-dir\/SKILL\.md/)
  assert.match(errors, /包内缺少 skills\/ghost-b\/SKILL\.md/)
})

test('既有套件形态不回归：无 path 的清单项仍读 <包根>/skills/<name>/', () => {
  const fx = fixture()
  assert.equal(fx.item.suite?.skills.every((entry) => !entry.path), true)
  const result = install(fx)
  assert.equal(result.skills.installed, 2)
  assert.equal(result.skills.failed, 0)
  assert.equal(existsSync(join(fx.home, 'skills', 'skill-a', 'SKILL.md')), true)
  assert.equal(existsSync(join(fx.home, 'skills', 'skill-b', 'SKILL.md')), true)
})

/* ------------------------------------------------------------------ 工具 */

function mockReq(method: string, url: string, headers: Record<string, string>, body?: unknown): IncomingMessage {
  const bodyStr = body !== undefined ? JSON.stringify(body) : ''
  const stream = new Readable({
    read() {
      if (bodyStr) this.push(Buffer.from(bodyStr))
      this.push(null)
    },
  }) as unknown as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = { host: '127.0.0.1:3080', ...headers }
  return stream
}

function mockRes(): ServerResponse & { _status: number, _json: any } {
  const res = {
    statusCode: 200,
    _status: 200,
    _json: null,
    setHeader() {},
    end(chunk?: string | Buffer) {
      this._status = this.statusCode
      const text = chunk == null ? '' : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      try {
        this._json = JSON.parse(text)
      } catch {
        this._json = null
      }
    },
  }
  return res as unknown as ServerResponse & { _status: number, _json: any }
}

async function callApi(
  method: string,
  body: Record<string, unknown>,
  cfg: ReturnType<typeof withDefaults>,
  opts: { httpMethod?: string, origin?: string } = {},
): Promise<{ status: number, json: any }> {
  const origin = opts.origin ?? 'http://127.0.0.1:3080'
  const httpMethod = opts.httpMethod ?? 'POST'
  // GET 请求没有 body，方法只能走 query
  const url = httpMethod === 'POST' ? '/api' : `/api?method=${encodeURIComponent(method)}`
  const req = mockReq(httpMethod, url, { origin, 'sec-fetch-site': origin.includes('evil') ? 'cross-site' : 'same-origin' }, httpMethod === 'POST' ? { method, ...body } : undefined)
  const res = mockRes()
  await handleApi(req, res, cfg)
  return { status: res._status, json: res._json }
}
