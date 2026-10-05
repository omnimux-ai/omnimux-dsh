// 数据集契约测试：规模、档位可见量、对外结构、内容摘要与访问器。
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CategoryByID,
  ETag,
  Fragment,
  OptionByID,
  Taxonomy,
  ValidTier,
  promptOrder,
  readTaxonomyBytes,
  servedTaxonomy,
} from './taxonomy.js'

test('数据集规模为 18 个分类 / 170 个选项', () => {
  const tax = Taxonomy()
  assert.equal(tax.categories.length, 18)
  let options = 0
  for (const c of tax.categories) options += c.options.length
  assert.equal(options, 170)
})

test('各档位可见选项数精确为 normal=124 / freak=167 / total=170', () => {
  const visible = { normal: 0, freak: 0, total: 0 }
  for (const c of Taxonomy().categories) {
    for (const o of c.options) {
      for (const tier of o.visibleIn) visible[tier] += 1
    }
  }
  assert.deepEqual(visible, { normal: 124, freak: 167, total: 170 })
})

test('servedTaxonomy 只有 Go 结构体的 6 个键，rules / counts 必须缺席', () => {
  const served = servedTaxonomy()
  assert.deepEqual(
    Object.keys(served).sort(),
    ['categories', 'category_priority', 'prompt_map', 'source', 'tier_group', 'version']
  )
  assert.ok(!Object.hasOwn(served, 'rules'))
  assert.ok(!Object.hasOwn(served, 'counts'))
  // 原始解析结果里这两个键存在，剔除动作确实发生了。
  assert.ok(Object.hasOwn(Taxonomy(), 'rules'))
  assert.ok(Object.hasOwn(Taxonomy(), 'counts'))
})

test('ETag 为 16 位小写十六进制且稳定', () => {
  const etag = ETag()
  assert.match(etag, /^[0-9a-f]{16}$/)
  assert.equal(etag, ETag())
  assert.equal(readTaxonomyBytes().length, 40877)
})

test('promptOrder 为 18 项且顺序与 Go 端一致', () => {
  assert.equal(promptOrder.length, 18)
  assert.deepEqual([...promptOrder], [
    'gender', 'ethnicity_origin_base', 'age', 'skin_tone', 'height',
    'body_type', 'proportions', 'freak_head', 'freak_neck', 'eye_shape',
    'eye_color', 'freak_face', 'facial_hair', 'hair', 'hair_colour',
    'distinctive', 'aesthetic', 'accessory',
  ])
})

test('category_priority 与数据集一致', () => {
  assert.deepEqual(servedTaxonomy().category_priority, [
    'gender', 'body_type', 'hair', 'hair_colour', 'aesthetic',
  ])
})

test('ValidTier 只认 tier_group 里的档位', () => {
  assert.deepEqual(servedTaxonomy().tier_group.options.map((o) => o.id), ['normal', 'freak', 'total'])
  for (const tier of ['normal', 'freak', 'total']) assert.ok(ValidTier(tier))
  for (const tier of ['', 'NORMAL', 'notatier', undefined]) assert.ok(!ValidTier(tier))
})

test('CategoryByID / OptionByID 未命中返回 null', () => {
  assert.equal(CategoryByID('nope'), null)
  assert.equal(CategoryByID('gender').id, 'gender')
  assert.equal(OptionByID('nope', 'male'), null)
  assert.equal(OptionByID('gender', 'nope'), null)
  assert.equal(OptionByID('gender', 'male').id, 'male')
})

test('Fragment 命中 prompt_map，缺失时回退原始选项 id', () => {
  assert.equal(Fragment('gender', 'male'), 'Male')
  assert.equal(Fragment('hair', 'hair_afro'), 'afro')
  assert.equal(Fragment('gender', 'does_not_exist'), 'does_not_exist')
  assert.equal(Fragment('no_such_category', 'x'), 'x')
})
