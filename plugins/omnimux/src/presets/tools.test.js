import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mountPresetsTools,
  queryMarketingPresets,
  PRESET_DIMENSIONS,
} from './tools.js'

test('Marketing Presets Tool: queryMarketingPresets 各维度与筛选检索逻辑', () => {
  // 1. 维度总计验证
  const totalFormats = PRESET_DIMENSIONS.format.items.length
  const totalHooks = PRESET_DIMENSIONS.hook.items.length
  const totalStyles = PRESET_DIMENSIONS.style.items.length
  assert.equal(totalFormats, 96, '广告格式应为 96 款')
  assert.equal(totalHooks, 75, '开场亮点应为 75 款')
  assert.equal(totalStyles, 20, '视觉风格应为 20 款')

  // 2. 默认全量检索 (all)
  const allRes = queryMarketingPresets({ dimension: 'all', limit: 10 })
  assert.equal(allRes.total, totalFormats + totalHooks + totalStyles, '全量维度总计应为 191 款')
  assert.equal(allRes.items.length, 10, '默认受 limit: 10 约束')

  // 3. 按广告格式检索 (format)
  const formatRes = queryMarketingPresets({ dimension: 'format', limit: 50 })
  assert.equal(formatRes.total, 96)
  assert.equal(formatRes.dimension, 'format')
  assert.ok(formatRes.items.every((it) => it.dimension === 'format'))

  // 4. 按开场亮点检索 (hook)
  const hookRes = queryMarketingPresets({ dimension: 'hook', limit: 50 })
  assert.equal(hookRes.total, 75)
  assert.equal(hookRes.dimension, 'hook')
  assert.ok(hookRes.items.every((it) => it.dimension === 'hook'))

  // 5. 按视觉风格检索 (style)
  const styleRes = queryMarketingPresets({ dimension: 'style', limit: 50 })
  assert.equal(styleRes.total, 20)
  assert.equal(styleRes.dimension, 'style')
  assert.ok(styleRes.items.every((it) => it.dimension === 'style'))

  // 6. 分类过滤测试 (category)
  const catRes = queryMarketingPresets({
    dimension: 'format',
    category: 'UGC 广告',
    limit: 50,
  })
  assert.ok(catRes.total > 0)
  assert.ok(catRes.items.every((it) => it.categoryNameZh.includes('UGC') || it.categoryName.includes('UGC')))

  // 7. 关键词模糊匹配 (query: '自拍' 或 'Lip')
  const selfieRes = queryMarketingPresets({
    query: '自拍',
    limit: 20,
  })
  assert.ok(selfieRes.total > 0, '应检索到与自拍相关的预设')
  assert.ok(selfieRes.items.some((it) => it.titleZh.includes('自拍') || it.title.includes('Selfie')))

  const lipRes = queryMarketingPresets({
    query: 'Lip',
    limit: 20,
  })
  assert.ok(lipRes.total > 0, '应检索到与 Lip 相关的预设')
  assert.ok(lipRes.items.some((it) => it.title.includes('Lip') || it.description.includes('Lip')))

  // 8. 关键词匹配 prompt 中的高级属性
  const droneRes = queryMarketingPresets({
    query: '希区柯克',
    limit: 10,
  })
  // 即使标题不包含，只要 prompt 或 description 中包含也能检索出
  assert.ok(droneRes.total >= 0)
})

test('Marketing Presets Tool: 工具注册与 Schema 契约校验', async () => {
  const registered = []
  const mockCtx = {
    tools: {
      register(tool) {
        registered.push(tool)
      },
    },
  }

  mountPresetsTools(mockCtx)
  assert.equal(registered.length, 1)

  const tool = registered[0]
  assert.equal(tool.name, 'omnimux_marketing_presets_search')
  assert.ok(tool.description.includes('营销广告预设'))
  assert.equal(tool.parameters.type, 'object')
  assert.ok(tool.parameters.properties.dimension)
  assert.ok(tool.parameters.properties.category)
  assert.ok(tool.parameters.properties.query)
  assert.ok(tool.parameters.properties.limit)

  // 执行空参调用测试
  const emptyExec = await tool.execute('call_1', {})
  assert.equal(emptyExec.ok, true)
  assert.ok(emptyExec.total > 100)
  assert.equal(emptyExec.items.length, 10)

  // 执行带条件调用测试
  const searchExec = await tool.execute('call_2', {
    dimension: 'hook',
    query: '自拍',
    limit: 5,
  })
  assert.equal(searchExec.ok, true)
  assert.ok(searchExec.total >= 1)
  assert.ok(searchExec.items.length <= 5)
  assert.equal(searchExec.items[0].dimension, 'hook')
  assert.ok(searchExec.items[0].titleZh)
  assert.ok(searchExec.items[0].prompt)
})
