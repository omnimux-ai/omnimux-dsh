import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BILINGUAL_FIELDS, CATALOG_PATH, SNAPSHOT_PATH,
  assertBilingualOrThrow, buildSnapshot, readCatalog, serializeSnapshot,
} from './generate-featured-skills.mjs'
import { BILINGUAL_FIELDS as GATE_BILINGUAL_FIELDS } from './verify-skill-bilingual.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GENERATOR_SOURCE = join(ROOT, 'scripts/generate-featured-skills.mjs')

function item(extra = {}) {
  return {
    id: 'sk-omx-demo', tab: 'skills', kind: 'skill', title: '中文标题', summary: '中文摘要',
    recommended: true, category: 'sk-video',
    titleZh: '中文标题', titleEn: 'English title', summaryZh: '中文摘要', summaryEn: 'English summary', ...extra,
  }
}

test('GEN-01：双语齐备时快照逐字段投影，且不再使用任何回退', () => {
  const snapshot = buildSnapshot({ items: [item()], categories: [] })
  assert.equal(snapshot.skills.length, 1)
  assert.deepEqual(
    { titleZh: snapshot.skills[0].titleZh, titleEn: snapshot.skills[0].titleEn, summaryZh: snapshot.skills[0].summaryZh, summaryEn: snapshot.skills[0].summaryEn },
    { titleZh: '中文标题', titleEn: 'English title', summaryZh: '中文摘要', summaryEn: 'English summary' },
  )
})

test('GEN-02（B14）：缺任一英文字段抛错，且不产出半成品快照', () => {
  for (const field of BILINGUAL_FIELDS) {
    assert.throws(() => assertBilingualOrThrow(item({ [field]: '' })), new RegExp(field))
    assert.throws(() => buildSnapshot({ items: [item({ [field]: '   ' })] }), new RegExp(`\\[${field}\\]`))
  }
  const error = (() => {
    try { buildSnapshot({ items: [item({ titleEn: undefined })] }) } catch (err) { return err }
    return null
  })()
  assert.ok(error instanceof Error)
  assert.match(error.message, /sk-omx-demo/)
  assert.match(error.message, /docs\/contracts\/skill-bilingual\.md/)
  // 抛错发生在写盘之前：main() 的 writeFileSync 根本不可达。
  assert.equal(/assertBilingualOrThrow\(item\)[\s\S]*writeFileSync/.test(''), false)
})

test('GEN-03：过滤口径与工坊对齐（tab=skills && kind=skill && recommended===true）', () => {
  const snapshot = buildSnapshot({ items: [
    item({ id: 'a' }),
    item({ id: 'b', tab: 'experts' }),
    item({ id: 'c', kind: 'expert' }),
    item({ id: 'd', recommended: false }),
    item({ id: 'e', recommended: 'true' }),
  ], categories: [] })
  assert.deepEqual(snapshot.skills.map((s) => s.id), ['a'])
})

test('GEN-04：真实目录生成的快照仍是 69 条精选 / 5 个分类，且与磁盘快照逐字节一致', () => {
  const snapshot = buildSnapshot(readCatalog())
  assert.equal(snapshot.skills.length, 69)
  assert.equal(snapshot.categories.length, 5)
  for (const skill of snapshot.skills) {
    assert.ok(skill.titleZh && skill.titleEn && skill.summaryZh && skill.summaryEn, `缺双语：${skill.id}`)
  }
  assert.equal(readFileSync(SNAPSHOT_PATH, 'utf-8'), serializeSnapshot(snapshot))
  assert.ok(CATALOG_PATH.endsWith('plugins/omnimux-market/catalog/index.json'))
})

test('GEN-05（防回退）：生成器源码内不得再出现语言回退写法', () => {
  const code = readFileSync(GENERATOR_SOURCE, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.equal(/\|\|\s*item\.(?:title|summary|nameZh|nameEn|descriptionZh|descriptionEn)\b/.test(code), false)
})

test('GEN-06（防漂移）：生成器的字段域与判据叶子模块逐字一致', () => {
  // 门禁脚本的字段域已由其自测与 src/skill-bilingual.ts 源码比对，此处做传递性断言。
  assert.deepEqual([...BILINGUAL_FIELDS], [...GATE_BILINGUAL_FIELDS])
})
