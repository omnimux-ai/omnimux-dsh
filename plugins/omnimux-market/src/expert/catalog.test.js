import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogMemoSize, decorateCatalog, invalidateCatalogMemos, loadCatalog, mcpInstalled, parseCatalog } from './catalog.js'
import { formatMcpRow, installItem } from './install.js'

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

test('loadCatalog memos by path+mtime; install invalidates installed flag', () => {
  invalidateCatalogMemos()
  const first = loadCatalog()
  assert.equal(catalogMemoSize(), 1)
  const second = loadCatalog()
  assert.equal(second, first)
  assert.equal(catalogMemoSize(), 1)

  const home = mkdtempSync(join(tmpdir(), 'omx-cat-memo-'))
  mkdirSync(join(home, 'profiles', 'omnimux'), { recursive: true })
  const roots = { home, profileDir: join(home, 'profiles', 'omnimux'), packageRoot: PACKAGE_ROOT }
  const before = decorateCatalog(loadCatalog(), roots)
  const demo = before.items.find((row) => row.id === 'esc-demo-skill')
  assert.equal(demo?.installed, false)
  installItem({ catalog: loadCatalog(), id: 'esc-demo-skill', ...roots })
  const after = decorateCatalog(loadCatalog(), roots)
  assert.equal(after.items.find((row) => row.id === 'esc-demo-skill')?.installed, true)
})

test('loads bundled catalog', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  assert.equal(doc.schema, 1)
  const experts = doc.items.filter((item) => item.tab === 'experts')
  const skills = doc.items.filter((item) => item.tab === 'skills')
  const connectors = doc.items.filter((item) => item.tab === 'connectors')
  // 社媒运营四层漏斗（L0 源分类预筛 → L2 黑名单 → L3 人工 → L1 任务重映射）后的数量
  assert.ok(experts.length >= 60)
  assert.ok(skills.length >= 50)
  assert.ok(connectors.length >= 15)
  assert.ok(experts.filter((item) => item.id !== 'exp-social-engagement-team' && item.id !== 'exp-social-content-team').every((item) => item.source.type === 'git'))
  const team = experts.find((item) => item.id === 'exp-social-engagement-team')
  assert.equal(team?.kind, 'team')
  assert.equal(team?.source.type, 'bundled')
  assert.equal(team?.source.path, 'catalog/experts/social-engagement-team')
  const contentTeam = experts.find((item) => item.id === 'exp-social-content-team')
  assert.equal(contentTeam?.kind, 'team')
  assert.equal(contentTeam?.source.type, 'bundled')
  assert.equal(contentTeam?.source.path, 'catalog/experts/social-content-team')
  assert.ok(doc.items.some((item) => item.kind === 'connector'))
  const ui = experts.find((item) => item.id === 'exp-ad-creative-strategist')
  assert.equal(ui?.title, '广告创意策略师')
  assert.equal(ui?.subtitle, '点睛睛')
  assert.match(ui?.avatar || '', /raw\.githubusercontent\.com\/infometa\/workbuddyskills/)
  assert.ok(doc.categories.some((row) => row.tab === 'skills' && row.title === '协作办公'))
  assert.equal(doc.categories.some((row) => row.tab === 'skills' && row.title === 'AI / Agent 工具'), false)
})

test('skill metadata is strict and cannot alter expert/team featured semantics', () => {
  const base = { id: 'sk-test', kind: 'skill', tab: 'skills', skill: 'test', title: 'Test', summary: '动画', category: 'sk-visual', source: { type: 'bundled', path: 'catalog/skills/test' } }
  for (const recommended of [undefined, false, 'true', 1, [], {}]) {
    const doc = parseCatalog({ schema: 1, generated_at: 'fixture', items: [{ ...base, recommended }] })
    assert.equal(doc.items[0].recommended, false)
    assert.equal(doc.items[0].downloads, null)
  }
  const doc = parseCatalog({ schema: 1, generated_at: 'fixture', featured: ['exp-test'], items: [
    { ...base, recommended: true, downloads: 0, version: '1.0', cover: { asset: 'catalog/covers/test.webp', alt: 'Test' } },
    { ...base, id: 'exp-test', kind: 'expert', tab: 'experts', recommended: true },
    { ...base, id: 'team-test', kind: 'team', tab: 'experts', recommended: true },
  ] })
  assert.equal(doc.items[0].recommended, true)
  assert.equal(doc.items[0].downloads, 0)
  assert.equal(doc.items[0].version, '1.0')
  assert.deepEqual(doc.items[0].cover, { asset: 'catalog/covers/test.webp', alt: 'Test' })
  assert.deepEqual(doc.featured, ['exp-test'])
  assert.equal('recommended' in doc.items[1], false)
  assert.equal('recommended' in doc.items[2], false)
  for (const asset of ['https://example.com/image.png', 'catalog/covers/../private.png', 'catalog/covers/test.svg']) {
    const parsed = parseCatalog({ schema: 1, generated_at: 'fixture', items: [{ ...base, cover: { asset } }] })
    assert.equal(parsed.items[0].cover, undefined)
  }
})

test('rejects unknown schema', () => {
  assert.throws(() => parseCatalog({ schema: 2, generated_at: 'x', items: [] }), /unsupported schema/)
})

test('decorate marks missing items uninstalled', () => {
  const home = mkdtempSync(join(tmpdir(), 'omx-cat-'))
  mkdirSync(join(home, 'profiles', 'omnimux'), { recursive: true })
  const doc = decorateCatalog(loadCatalog(), {
    home,
    profileDir: join(home, 'profiles', 'omnimux'),
    packageRoot: PACKAGE_ROOT,
  })
  assert.equal(doc.items.every((item) => item.installed === false), true)
})

test('decorate sees a copied skill as installed', () => {
  const home = mkdtempSync(join(tmpdir(), 'omx-cat-'))
  mkdirSync(join(home, 'skills', 'esc-demo-note'), { recursive: true })
  writeFileSync(join(home, 'skills', 'esc-demo-note', 'SKILL.md'), '# x\n')
  const doc = decorateCatalog(loadCatalog(), {
    home,
    profileDir: join(home, 'profiles', 'omnimux'),
    packageRoot: PACKAGE_ROOT,
  })
  const item = doc.items.find((row) => row.id === 'esc-demo-skill')
  assert.equal(item.installed, true)
})

test('mcpInstalled matches rows exactly, not by id prefix', () => {
  // cn-tencent-docs 是 cn-tencent-docs-oa 的 id 前缀：子串匹配会把前者误判为已装
  const home = mkdtempSync(join(tmpdir(), 'omx-cat-'))
  const profileDir = join(home, 'profiles', 'omnimux')
  mkdirSync(profileDir, { recursive: true })
  const rowOa = formatMcpRow({
    id: 'cn-tencent-docs-oa',
    serverName: 'tencent-docs-oa',
    source: { type: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'x'] },
  })
  writeFileSync(join(profileDir, 'cordis.patch.yml'), `- insert:\n${rowOa}\n`)
  assert.equal(mcpInstalled(profileDir, 'cn-tencent-docs-oa'), true)
  assert.equal(mcpInstalled(profileDir, 'cn-tencent-docs'), false)
  // patch 文件不存在时一律未装
  assert.equal(mcpInstalled(join(home, 'profiles', 'none'), 'cn-tencent-docs'), false)
})
