/**
 * @file 产物里 primitives 解构行的严格校验（#3652，独立评审整改）。
 *
 * `icon-compat-wiring.e2e.spec.js` 的负向正则只在旧图标名恰好是解构末项时命中，
 * 且正向 `/IconCloseOutline16/` 恒真。本文件改成逐行检查：**任何**包含
 * `require("@deepseek-ai/dsh-client-ui-primitives")` 的行都不得出现旧图标名
 * （0.2.1-rc.3 宿主上旧名是 undefined），与旧名在解构里的位置无关。
 *
 * 这是产物接线断言，不是浏览器旅程；功能路径的浏览器证据见
 * `docs/evidence/worktree-web-qa-report.json`（本工作树 6/6 通过）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const bundle = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')

/** 0.1.5 的旧图标名。 */
const LEGACY_ICONS = [
  'IconCheckOutline16',
  'IconChevronDownOutline14',
  'IconChevronUpOutline14',
  'IconChevronLeftOutline14',
  'IconCloseFill14',
  'IconCloseOutline16',
  'IconCopyOutline16',
  'IconDownloadOutline16',
  'IconEditOutline16',
  'IconEllipsisOutline16',
  'IconLoadingOutline16',
  'IconPaperclipOutline16',
  'IconPlayOutline16',
  'IconPlusOutline16',
  'IconRefreshOutline14',
  'IconRefreshOutline16',
  'IconRightUpOutline14',
  'IconSearchOutline16',
  'IconTrashOutline16',
]

const MODULE_ID = 'require("@deepseek-ai/dsh-client-ui-primitives")'

test('E2E 接线：primitives 解构行里没有旧图标名', () => {
  const requireLines = bundle.split('\n').filter((line) => line.includes(MODULE_ID))
  assert.ok(requireLines.length > 0, '产物应有 primitives 解构行（Tooltip / Menu 之类）')
  const offenders = []
  for (const line of requireLines) {
    for (const name of LEGACY_ICONS) {
      if (line.includes(name)) offenders.push(name)
    }
  }
  assert.deepEqual(offenders, [], `primitives 解构行仍含旧图标名：${offenders.join(', ')}`)
})
