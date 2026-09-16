import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkCatalog,
  checkMirror,
  FORBIDDEN_WORDS,
  MIRROR_PATH,
  ALLOWED_LABELS,
} from '../../../../scripts/verify-channel-group-naming.mjs'
import { MODEL_CHANNEL_GROUPS } from '../../../../plugins/omnimux/src/catalog/serving/channel-groups.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const mirrorPath = join(repoRoot, MIRROR_PATH)
const hubPath = join(repoRoot, 'plugins/omnimux/src/catalog/serving/channel-groups.js')

const enabledGroups = () =>
  Object.values(MODEL_CHANNEL_GROUPS)
    .flat()
    .filter((g) => g.enabled !== false)

test('e2e: 全部渠道分组的 label 与 badge 命中命名规范（白名单 + 禁用词）', () => {
  const violations = checkCatalog(MODEL_CHANNEL_GROUPS)
  assert.deepEqual(violations, [], `命名违规：${JSON.stringify(violations)}`)
  assert.ok(enabledGroups().length >= 30, '分组数量不应低于 30')
})

test('e2e: 画布镜像的分组文案与中枢逐字一致', () => {
  const mirrorText = readFileSync(mirrorPath, 'utf8')
  assert.deepEqual(checkMirror(MODEL_CHANNEL_GROUPS, mirrorText), [])
})

test('e2e: MiniMax H3 五档使用统一价值语义命名', () => {
  const labels = MODEL_CHANNEL_GROUPS['minimax-h3']
    .filter((g) => g.enabled !== false)
    .map((g) => g.label)
  assert.deepEqual(labels, ['标准版', '极速版', '经济版', '高清版', '长片版'])
})

test('e2e: 面向用户的分组文案不再出现供应商名与采购层黑话', () => {
  const surfaces = [readFileSync(hubPath, 'utf8'), readFileSync(mirrorPath, 'utf8')]
  const banned = ['Pidoi', 'AutoDL', 'Evolink', '号池', '官转', '高价', '特惠', '进阶', '顶配']
  for (const text of surfaces) {
    // 只校验面向用户的分组数据字段；工程注释里的上游溯源不属对外文案
    const rows = [...text.matchAll(/"(?:label|badge)": "([^"]*)"/g)].map((m) => m[1])
    assert.ok(rows.length >= 60, '应能解析出分组文案字段')
    for (const row of rows) {
      for (const word of banned) {
        assert.ok(!row.includes(word), `分组文案「${row}」不应包含「${word}」`)
      }
    }
  }
})

test('e2e: 旧档位名不再作为任何分组的 label 出现', () => {
  const legacy = ['特惠版', '进阶版', '顶配满血版', '进阶增强版', '官方直连版', '高价档', '号池版', '工作流·高速档', '工作流·画质档', '任务版']
  const labels = enabledGroups().map((g) => g.label)
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
