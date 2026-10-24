/**
 * @file 图标双代兼容层契约（#3652）。
 *
 * 0.1.5 的图标名把尺寸写进名字（`Icon<Name>Outline<14|16>`），0.2.x 改成笔画变体
 * （`…OutlineRegular|Medium`）并把尺寸移到 `IconProps.size`。兼容层按
 * `旧名 ?? 新名` 解析，因此这里锁定两件事：
 *
 * 1. 源码里每个旧名都配了正确的 0.2.x 新名（19 对，逐条对照）；
 * 2. 构建产物真的导出了这 19 个稳定名（否则插件 import 会在运行期拿到 undefined）。
 *
 * 运行方式：hub 的 `pnpm --filter omnimux test`（CI 的 workspace 测试也会跑到），
 * 因此断言读取的是构建产物 `packages/dsh-ui-kit/lib/index.js`。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const compatSource = readFileSync(
  new URL('../../../../packages/dsh-ui-kit/src/icons/compat-icons.tsx', import.meta.url),
  'utf8',
)
const kitEntry = readFileSync(
  new URL('../../../../packages/dsh-ui-kit/lib/index.js', import.meta.url),
  'utf8',
)

/** 旧名 → 0.2.x 新名（19 对，见 #3652 清点表）。 */
const PAIRS = [
  ['IconCheckOutline16', 'IconCheckOutlineRegular'],
  ['IconChevronDownOutline14', 'IconChevronDownOutlineRegular'],
  ['IconChevronUpOutline14', 'IconChevronUpOutlineRegular'],
  ['IconChevronLeftOutline14', 'IconChevronLeftOutlineRegular'],
  ['IconCloseFill14', 'IconCloseFillRegular'],
  ['IconCloseOutline16', 'IconCloseOutlineRegular'],
  ['IconCopyOutline16', 'IconCopyOutlineRegular'],
  ['IconDownloadOutline16', 'IconDownloadOutlineRegular'],
  ['IconEditOutline16', 'IconEditOutlineRegular'],
  ['IconEllipsisOutline16', 'IconEllipsisOutlineRegular'],
  ['IconLoadingOutline16', 'IconLoadingOutlineRegular'],
  ['IconPaperclipOutline16', 'IconPaperclipOutlineRegular'],
  ['IconPlayOutline16', 'IconPlayOutlineRegular'],
  ['IconPlusOutline16', 'IconPlusOutlineRegular'],
  ['IconRefreshOutline14', 'IconRefreshOutlineRegular'],
  ['IconRefreshOutline16', 'IconRefreshOutlineRegular'],
  ['IconRightUpOutline14', 'IconRightUpOutlineRegular'],
  ['IconSearchOutline16', 'IconSearchOutlineRegular'],
  ['IconTrashOutline16', 'IconTrashOutlineRegular'],
]

test('每个旧图标名都解析到它的 0.2.x 新名', () => {
  for (const [legacy, modern] of PAIRS) {
    assert.ok(
      compatSource.includes(`resolve("${legacy}", "${modern}")`),
      `${legacy} 必须解析到 ${modern}`,
    )
  }
})

test('dsh-ui-kit 构建产物导出全部 19 个稳定图标名', () => {
  const exportLine = kitEntry.match(/^export \{[^}]*\};$/m)
  assert.ok(exportLine, 'lib/index.js 应有具名导出表')
  for (const [legacy] of PAIRS) {
    assert.ok(exportLine[0].includes(legacy), `构建产物缺少导出 ${legacy}`)
  }
})
