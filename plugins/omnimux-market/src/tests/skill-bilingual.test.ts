import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  OFFICIAL_SHELF_SCOPE, SKILL_BILINGUAL_FIELDS, SKILL_BILINGUAL_LIMITS,
  checkSkillBilingual, isOfficialShelfItem, normalizeBilingualField,
} from '../skill-bilingual.js'
import {
  SKILL_BILINGUAL_LIMITS as CATALOG_BILINGUAL_LIMITS, catalogRoot, loadCatalog, parseCatalog,
} from '../expert/catalog.js'

const complete = {
  titleZh: '三维动画短片生成',
  titleEn: '3D Animation Short Generator',
  summaryZh: '把一句话创意变成三维动画短片。',
  summaryEn: 'Turn a one-line idea into a 3D animated short.',
}

function official(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'sk-omx-demo', kind: 'skill', tab: 'skills', recommended: true, ...extra }
}

function rawItem(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sk-omx-demo-skill',
    tab: 'skills',
    kind: 'skill',
    title: '演示技能',
    summary: '中文摘要',
    category: 'sk-visual',
    skill: 'demo-skill',
    source: { type: 'git', repo: 'infometa/workbuddyskills', path: 'skills/demo', ref: 'main' },
    ...extra,
  }
}

function rawDoc(items: unknown[]): unknown {
  return {
    schema: 1,
    generated_at: '2026-09-13T00:00:00Z',
    tabs: ['experts', 'skills', 'connectors'],
    categories: [{ id: 'sk-visual', title: '视觉创作', tab: 'skills' }],
    items,
  }
}

/** 解析层返回的是联合类型（skill 分支 / 非 skill 分支），断言双语字段时收窄为字典。 */
function parseFirstItem(raw: unknown): Record<string, unknown> {
  const doc = parseCatalog(raw) as unknown as { items: Record<string, unknown>[] }
  return doc.items[0]
}

test('契约：字段域顺序与长度上限冻结', () => {
  assert.deepEqual([...SKILL_BILINGUAL_FIELDS], ['titleZh', 'titleEn', 'summaryZh', 'summaryEn'])
  assert.deepEqual({ ...SKILL_BILINGUAL_LIMITS }, { titleZh: 80, titleEn: 80, summaryZh: 200, summaryEn: 200 })
  assert.equal(Object.isFrozen(SKILL_BILINGUAL_LIMITS), true)
  assert.equal(OFFICIAL_SHELF_SCOPE, 'kind:skill && tab:skills && recommended:true')
})

test('契约：目录解析层与判据模块的长度上限一致（防两处常量漂移）', () => {
  assert.deepEqual({ ...CATALOG_BILINGUAL_LIMITS }, { ...SKILL_BILINGUAL_LIMITS })
})

test('T01-01：4 字段齐全时通过，原样返回归一化值', () => {
  const check = checkSkillBilingual({ ...official(), ...complete })
  assert.equal(check.ok, true)
  assert.deepEqual(check.missingFields, [])
  assert.equal(check.titleZh, complete.titleZh)
  assert.equal(check.titleEn, complete.titleEn)
  assert.equal(check.summaryZh, complete.summaryZh)
  assert.equal(check.summaryEn, complete.summaryEn)
})

test('T01-02：缺 summaryEn 时只列该字段且不通过', () => {
  const check = checkSkillBilingual({ ...official(), ...complete, summaryEn: undefined })
  assert.equal(check.ok, false)
  assert.deepEqual(check.missingFields, ['summaryEn'])
  assert.equal(check.summaryEn, '')
})

test('T01-03（B1）：空白串视为缺失，顺序同字段域契约', () => {
  const check = checkSkillBilingual(official({
    titleZh: '   ', titleEn: '\n\t', summaryZh: '有值', summaryEn: 'has value',
  }))
  assert.equal(check.ok, false)
  assert.deepEqual(check.missingFields, ['titleZh', 'titleEn'])
})

test('T01-04（B2）：null / 数字 / 对象 / 数组一律归一化为空串且不抛异常', () => {
  for (const bad of [null, 42, { v: 1 }, ['x'], true, undefined]) {
    const check = checkSkillBilingual(official({
      titleZh: bad, titleEn: bad, summaryZh: bad, summaryEn: bad,
    }))
    assert.equal(check.ok, false)
    assert.deepEqual(check.missingFields, ['titleZh', 'titleEn', 'summaryZh', 'summaryEn'])
    assert.equal(normalizeBilingualField(bad, 'titleZh'), '')
  }
  assert.equal(checkSkillBilingual(null).ok, false)
  assert.equal(checkSkillBilingual(undefined).ok, false)
  assert.equal(checkSkillBilingual('not-an-object').ok, false)
})

test('T01-05（B3）：超长字段截断到上限，且 ok 仍为 true', () => {
  const long = (n: number) => 'x'.repeat(n)
  const check = checkSkillBilingual(official({
    titleZh: long(200), titleEn: long(200), summaryZh: long(500), summaryEn: long(500),
  }))
  assert.equal(check.ok, true)
  assert.deepEqual(check.missingFields, [])
  assert.equal(check.titleZh.length, SKILL_BILINGUAL_LIMITS.titleZh)
  assert.equal(check.titleEn.length, SKILL_BILINGUAL_LIMITS.titleEn)
  assert.equal(check.summaryZh.length, SKILL_BILINGUAL_LIMITS.summaryZh)
  assert.equal(check.summaryEn.length, SKILL_BILINGUAL_LIMITS.summaryEn)
  assert.equal(normalizeBilingualField(`   ${long(90)}   `, 'titleZh').length, 80)
})

test('T01-06（B4）：同值（英文位回填中文）形态合法，判据仍通过', () => {
  const check = checkSkillBilingual(official({
    titleZh: '三维动画短片', titleEn: '三维动画短片', summaryZh: '摘要', summaryEn: '摘要',
  }))
  assert.equal(check.ok, true)
})

test('T01-07（回归红线）：判据内绝不做语言回退', () => {
  const check = checkSkillBilingual({ title: '中文标题', summary: '中文摘要' })
  assert.equal(check.ok, false)
  assert.deepEqual(check.missingFields, ['titleZh', 'titleEn', 'summaryZh', 'summaryEn'])
  assert.equal(check.titleZh, '')
  assert.equal(check.summaryZh, '')
  assert.equal(checkSkillBilingual({ title: '中文', summary: '中文', nameEn: 'EN name' }).ok, false)
})

test('T01-08（B5）：isOfficialShelfItem 只认 kind+tab+recommended 三元组', () => {
  assert.equal(isOfficialShelfItem(official()), true)
  assert.equal(isOfficialShelfItem(official({ recommended: false })), false)
  assert.equal(isOfficialShelfItem(official({ recommended: 'true' })), false)
  assert.equal(isOfficialShelfItem(official({ tab: 'experts' })), false)
  assert.equal(isOfficialShelfItem(official({ kind: 'expert' })), false)
  assert.equal(isOfficialShelfItem(official({ kind: 'connector', tab: 'connectors' })), false)
  assert.equal(isOfficialShelfItem({}), false)
  assert.equal(isOfficialShelfItem(null), false)
})

test('T01-09：目录解析层补回双语投影，且绝不用 title/summary 回填', () => {
  const withBilingual = parseFirstItem(rawDoc([rawItem({
    titleZh: '  演示技能  ', titleEn: 'Demo Skill', summaryZh: '中文摘要', summaryEn: 'English summary',
  })]))
  assert.equal(withBilingual.titleZh, '演示技能')
  assert.equal(withBilingual.titleEn, 'Demo Skill')
  assert.equal(withBilingual.summaryZh, '中文摘要')
  assert.equal(withBilingual.summaryEn, 'English summary')

  const legacy = parseFirstItem(rawDoc([rawItem({ id: 'sk-legacy-demo', skill: 'legacy-demo' })]))
  assert.equal(legacy.titleZh, '')
  assert.equal(legacy.titleEn, '')
  assert.equal(legacy.summaryZh, '')
  assert.equal(legacy.summaryEn, '')
  assert.equal(legacy.title, '演示技能')
  assert.equal(checkSkillBilingual(legacy).ok, false)
})

test('T01-11：目录解析层不得静默截断标签（领域标签必须存活到工坊投影）', () => {
  const raw = JSON.parse(readFileSync(join(catalogRoot(), 'index.json'), 'utf-8')) as {
    items: Array<{ id: string; tags?: string[] }>
  }
  const parsed = loadCatalog() as unknown as { items: Array<{ id: string; tags?: string[] }> }
  const byId = new Map(parsed.items.map((item) => [item.id, item]))
  const truncated = raw.items
    .filter((item) => (byId.get(item.id)?.tags || []).length !== (item.tags || []).length)
    .map((item) => item.id)
  assert.deepEqual(truncated, [])
})

test('T01-10：真实目录的 69 项官方货架技能全部通过判据（T01 验收证据）', () => {
  const catalog = loadCatalog()
  const shelf = catalog.items.filter((item: unknown) => isOfficialShelfItem(item))
  assert.equal(shelf.length, 69)
  const failed = shelf
    .map((item) => ({ id: String(item.id), check: checkSkillBilingual(item) }))
    .filter((row) => !row.check.ok)
    .map((row) => `${row.id}:${row.check.missingFields.join(',')}`)
  assert.deepEqual(failed, [])

  const sample = catalog.items.find((item) => item.id === 'sk-omx-3d-animation-short-generator') as unknown as
    Record<string, unknown> | undefined
  assert.ok(sample, '样例技能必须存在于目录')
  assert.equal('titleZh' in sample, true)
  assert.equal(typeof sample.titleZh, 'string')
  assert.ok(String(sample.titleZh).length > 0)
  assert.ok(String(sample.titleEn).length > 0)
})
