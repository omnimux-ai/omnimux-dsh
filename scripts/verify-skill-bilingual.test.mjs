import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BILINGUAL_FIELDS, BILINGUAL_LIMITS, CATALOG_PATH, SHELF_SCOPE,
  auditSkillBilingual, formatReport, normalizeField, parseArgs, verdictOf,
} from './verify-skill-bilingual.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(ROOT, 'scripts/verify-skill-bilingual.mjs')
const LEAF_SOURCE = join(ROOT, 'plugins/omnimux-market/src/skill-bilingual.ts')

function readCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
}

function officialItem(id, extra = {}) {
  return {
    id, tab: 'skills', kind: 'skill', title: id, summary: '中文摘要', category: 'sk-video',
    skill: id, recommended: true,
    titleZh: `中文标题 ${id}`, titleEn: `English title ${id}`,
    summaryZh: '中文摘要', summaryEn: 'English summary', ...extra,
  }
}

test('GATE-01：市场目录 69/69 官方货架技能双语齐备（门禁验收证据）', () => {
  const report = auditSkillBilingual(readCatalog())
  assert.equal(report.checked, 69)
  assert.equal(report.passed, 69)
  assert.deepEqual(report.failed, [])
  assert.deepEqual(report.warnings, [])
  assert.equal(report.scope, SHELF_SCOPE)
  assert.deepEqual(verdictOf(report), { ok: true, exitCode: 0, reasons: [] })
  assert.match(formatReport(report, CATALOG_PATH).join('\n'), /69\/69/)
})

test('GATE-02（B6 防空转）：0 条官方货架技能必须判定失败', () => {
  const report = auditSkillBilingual({ items: [] })
  assert.equal(report.checked, 0)
  assert.deepEqual(verdictOf(report), { ok: false, exitCode: 1, reasons: ['EMPTY_SCOPE'] })
  assert.match(formatReport(report, CATALOG_PATH).join('\n'), /空转/)
  // 只有范围外条目时同样算空转，不得因为「目录非空」就放行。
  const onlyLegacy = auditSkillBilingual({ items: [
    officialItem('a', { recommended: false, titleEn: '' }),
    officialItem('b', { tab: 'experts', kind: 'expert' }),
  ] })
  assert.equal(onlyLegacy.checked, 0)
  assert.equal(verdictOf(onlyLegacy).ok, false)
})

test('GATE-03（故障注入）：缺失字段被定位到 id 与字段名，且不通过', () => {
  const catalog = readCatalog()
  const target = catalog.items.find((item) => item.id === 'sk-omx-3d-animation-short-generator')
  target.titleEn = '   '
  target.summaryEn = undefined
  const report = auditSkillBilingual(catalog)
  assert.equal(report.checked, 69)
  assert.deepEqual(report.failed, [{
    id: 'sk-omx-3d-animation-short-generator',
    title: target.title,
    missingFields: ['titleEn', 'summaryEn'],
  }])
  assert.equal(verdictOf(report).ok, false)
  const text = formatReport(report, CATALOG_PATH).join('\n')
  assert.match(text, /sk-omx-3d-animation-short-generator/)
  assert.match(text, /titleEn, summaryEn/)
  assert.match(text, /docs\/contracts\/skill-bilingual\.md/)
})

test('GATE-04：非官方条目（recommended!==true / 非 skill / 非 skills tab）不纳入门禁', () => {
  const catalog = { items: [
    officialItem('legacy', { recommended: false, titleZh: '', titleEn: '', summaryZh: '', summaryEn: '' }),
    officialItem('expert', { kind: 'expert', tab: 'experts', titleZh: '', titleEn: '' }),
    officialItem('connector', { kind: 'connector', tab: 'connectors', titleEn: undefined }),
    officialItem('other-tab', { tab: 'experts', titleEn: undefined }),
    officialItem('strict-true', { recommended: 'true', titleEn: undefined }),
  ] }
  const report = auditSkillBilingual(catalog)
  assert.equal(report.checked, 0)
  assert.deepEqual(report.failed, [])
})

test('GATE-05（B3/B4）：超长截断仍通过；中英同值只告警不阻断', () => {
  const long = 'x'.repeat(500)
  const report = auditSkillBilingual({ items: [
    officialItem('long', { titleZh: long, titleEn: long, summaryZh: long, summaryEn: long }),
  ] })
  assert.equal(report.checked, 1)
  assert.deepEqual(report.failed, [])
  assert.equal(verdictOf(report).ok, true)
  assert.deepEqual(report.warnings, [{ id: 'long', fields: ['titleZh=titleEn', 'summaryZh=summaryEn'] }])
  assert.equal(normalizeField(long, 'titleZh').length, BILINGUAL_LIMITS.titleZh)
  assert.equal(normalizeField(null, 'titleZh'), '')
  assert.equal(auditSkillBilingual({ items: [officialItem('long', { titleZh: long, titleEn: long, summaryZh: long, summaryEn: long })] },
    { warnSameValue: false }).warnings.length, 0)
})

test('GATE-06：CLI 端到端——正常目录 exit 0，故障目录 exit 1 且不空转', () => {
  const ok = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /69\/69/)

  const asJson = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8' })
  assert.equal(asJson.status, 0)
  const report = JSON.parse(asJson.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.checked, 69)
  assert.equal(report.passed, 69)

  const dir = mkdtempSync(join(tmpdir(), 'skill-bilingual-gate-'))
  try {
    const brokenPath = join(dir, 'index.json')
    writeFileSync(brokenPath, JSON.stringify({ items: [officialItem('sk-omx-broken', { titleEn: '' })] }))
    const broken = spawnSync(process.execPath, [SCRIPT, '--catalog', brokenPath], { encoding: 'utf8' })
    assert.equal(broken.status, 1)
    assert.match(broken.stdout, /sk-omx-broken/)
    assert.match(broken.stdout, /titleEn/)

    const emptyPath = join(dir, 'empty.json')
    writeFileSync(emptyPath, JSON.stringify({ items: [] }))
    const empty = spawnSync(process.execPath, [SCRIPT, '--catalog', emptyPath], { encoding: 'utf8' })
    assert.equal(empty.status, 1)
    assert.match(empty.stdout, /空转/)

    const missing = spawnSync(process.execPath, [SCRIPT, '--catalog', join(dir, 'nope.json')], { encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /无法读取目录/)

    const badArg = spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' })
    assert.equal(badArg.status, 1)
    assert.match(badArg.stderr, /未知参数/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('GATE-07：参数解析支持 --catalog=<path> / --catalog <path> / --json', () => {
  assert.deepEqual(parseArgs([]), { catalog: CATALOG_PATH, json: false })
  assert.equal(parseArgs(['--json']).json, true)
  assert.equal(parseArgs(['--catalog', '/tmp/x.json']).catalog, '/tmp/x.json')
  assert.equal(parseArgs(['--catalog=rel.json']).catalog, resolve(process.cwd(), 'rel.json'))
  assert.throws(() => parseArgs(['--catalog']), /需要一个路径参数/)
  assert.throws(() => parseArgs(['--wat']), /未知参数/)
})

test('GATE-08（防漂移）：脚本镜像的字段域与判据叶子模块逐字一致', () => {
  const source = readFileSync(LEAF_SOURCE, 'utf-8')
  const fieldsBlock = /SKILL_BILINGUAL_FIELDS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source)
  assert.ok(fieldsBlock, '未能从判据模块提取 SKILL_BILINGUAL_FIELDS')
  const fields = [...fieldsBlock[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1])
  assert.deepEqual(fields, [...BILINGUAL_FIELDS])

  const limitsBlock = /SKILL_BILINGUAL_LIMITS[\s\S]*?Object\.freeze\(\{([\s\S]*?)\}\)/.exec(source)
  assert.ok(limitsBlock, '未能从判据模块提取 SKILL_BILINGUAL_LIMITS')
  const limits = Object.fromEntries([...limitsBlock[1].matchAll(/([A-Za-z]+)\s*:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]))
  assert.deepEqual(limits, { ...BILINGUAL_LIMITS })

  const scope = /OFFICIAL_SHELF_SCOPE\s*=\s*'([^']+)'/.exec(source)
  assert.ok(scope, '未能从判据模块提取 OFFICIAL_SHELF_SCOPE')
  assert.equal(scope[1], SHELF_SCOPE)

  // 判据红线：叶子模块的**可执行代码**内不得出现语言回退写法（注释里的反例说明不算）。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.equal(/\|\|\s*(?:item\.)?(?:title|summary)\b/.test(code), false)
})
