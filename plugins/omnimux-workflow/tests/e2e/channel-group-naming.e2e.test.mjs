import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkCanvasNames,
  checkProjectedCatalog,
  FORBIDDEN_WORDS,
  CANVAS_CHANNEL_MODULE,
  ALLOWED_LABELS,
} from '../../../../scripts/verify-channel-group-naming.mjs'
import { MODEL_CHANNEL_GROUPS } from '../../../../plugins/omnimux/src/catalog/serving/channel-groups.js'
import { buildModelCatalog } from '../../../../plugins/omnimux/src/catalog/list.js'
import { resolveReadOnlySnapshot } from '../../../../plugins/omnimux/src/catalog/cloud/current.js'
import { readCanvasCatalog } from '../../../../plugins/omnimux-workflow/src/workflow/seam/canvasCatalog.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const canvasPath = join(repoRoot, CANVAS_CHANNEL_MODULE)
const hubPath = join(repoRoot, 'plugins/omnimux/src/catalog/serving/channel-groups.js')

const readCatalog = () => buildModelCatalog({ env: {}, snapshot: resolveReadOnlySnapshot().snapshot })

/** 目录投影：模型 id → 线路行。 */
const projection = (catalog) => {
  const projected = {}
  for (const kind of ['text', 'image', 'video', 'audio']) {
    for (const row of catalog[kind] ?? []) projected[row.id] = row.channelGroups ?? []
  }
  return projected
}

test('e2e: 目录全部渠道分组的显示名命中命名规范（产品命名白名单 + 全域禁用词）', () => {
  const catalog = readCatalog()
  const report = checkProjectedCatalog(projection(catalog), MODEL_CHANNEL_GROUPS)
  assert.deepEqual(report.violations, [], `命名违规：${JSON.stringify(report.violations)}`)
  assert.ok(report.authoredCount >= 7, '产品命名线路必须逐个受白名单约束')
  assert.ok(report.gatewayCount >= 3, '网关直接发布的线路必须逐个计数，漂移可见')
})

test('e2e: 画布展示的分组文案与目录投影逐字一致', () => {
  const catalog = readCatalog()
  const canvasRows = readCanvasCatalog((name) => (name === 'modelCatalog' ? { list: () => catalog } : undefined))
  assert.deepEqual(checkCanvasNames(canvasRows, catalog), [])
})

test('e2e: 已下架型号不再持有任何显示名（含 MiniMax H3 六档）', () => {
  // 2026-10-21 #3516：MiniMax H3 全渠道停用；2026-10-25 P1b：线路由网关快照决定。
  // 展示覆盖表与目录投影都不应再为它保留任何档位名。
  const catalog = readCatalog()
  assert.equal(MODEL_CHANNEL_GROUPS['minimax-h3'], undefined)
  assert.equal(projection(catalog)['minimax-h3'], undefined)
  for (const legacy of ['标准版', '极速版', '经济版', '高清版', '长片版', '口型版']) {
    assert.ok(ALLOWED_LABELS.includes(legacy))
  }
})

test('e2e: 面向用户的分组文案不再出现供应商名与采购层黑话', () => {
  const surfaces = [readFileSync(hubPath, 'utf8'), readFileSync(canvasPath, 'utf8')]
  const banned = ['Pidoi', 'AutoDL', 'Evolink', '号池', '官转', '高价', '特惠', '进阶', '顶配']
  for (const text of surfaces) {
    // 只校验面向用户的分组数据字段；工程注释里的上游溯源不属对外文案
    const rows = [...text.matchAll(/"(?:label|badge)": "([^"]*)"/g)].map((m) => m[1])
    for (const row of rows) {
      for (const word of banned) {
        assert.ok(!row.includes(word), `分组文案「${row}」不应包含「${word}」`)
      }
    }
  }
})

test('e2e: 旧档位名不再作为任何分组的 label 出现', () => {
  const labels = Object.values(MODEL_CHANNEL_GROUPS)
    .flat()
    .filter((g) => g.enabled !== false)
    .map((g) => g.label)
  const legacy = ['特惠版', '进阶版', '顶配满血版', '进阶增强版', '官方直连版', '高价档', '号池版', '工作流·高速档', '工作流·画质档', '任务版']
  for (const name of legacy) {
    assert.ok(!labels.includes(name), `旧档位名「${name}」不应再作为分组显示名`)
  }
})

test('e2e: 命名规范契约文件存在且白名单与禁令可解析', () => {
  const contract = readFileSync(join(repoRoot, 'docs/contracts/channel-group-naming.md'), 'utf8')
  for (const word of ALLOWED_LABELS) {
    assert.ok(contract.includes(word), `契约应列出白名单词「${word}」`)
  }
  assert.match(contract, /禁止.*供应商|供应商名/)
  assert.ok(FORBIDDEN_WORDS.length >= 10)
})
