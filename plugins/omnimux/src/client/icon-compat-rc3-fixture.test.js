/**
 * @file 兼容层 0.2.x 名字的外部快照校验（#3652 评审整改）。
 *
 * `icon-compat-contract.test.js` 把 19 对映射手抄进测试再断言源码含同一字符串，
 * 实现写错新名也照样绿。本文件改成对**签入的 rc.3 导出清单**校验：
 * `packages/dsh-ui-kit/src/icons/fixtures/rc3-icon-exports.txt` 是从官方
 * `@deepseek-ai/dsh-client-ui-primitives@0.2.1-rc.3` 的 `lib/types/icons/index.d.ts`
 * 抽出的 190 个导出（fixture 头部记录 tarball SHA-256 与提取命令）。
 *
 * 运行方式：hub 的 `pnpm --filter omnimux test`（`src/**\/*.test.js` glob 覆盖本文件）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const fixtureText = readFileSync(
  new URL('../../../../packages/dsh-ui-kit/src/icons/fixtures/rc3-icon-exports.txt', import.meta.url),
  'utf8',
)
const compatText = readFileSync(
  new URL('../../../../packages/dsh-ui-kit/src/icons/compat-icons.tsx', import.meta.url),
  'utf8',
)

test('rc.3 导出清单可用（190 个图标名）', () => {
  const names = fixtureText.split('\n').filter((line) => line.startsWith('Icon'))
  assert.equal(names.length, 190)
})

test('兼容层用到的 0.2.x 新名都出现在 rc.3 清单里', () => {
  const modernNames = [
    'IconCheckOutlineRegular',
    'IconChevronDownOutlineRegular',
    'IconChevronUpOutlineRegular',
    'IconChevronLeftOutlineRegular',
    'IconCloseFillRegular',
    'IconCloseOutlineRegular',
    'IconCopyOutlineRegular',
    'IconDownloadOutlineRegular',
    'IconEditOutlineRegular',
    'IconEllipsisOutlineRegular',
    'IconLoadingOutlineRegular',
    'IconPaperclipOutlineRegular',
    'IconPlayOutlineRegular',
    'IconPlusOutlineRegular',
    'IconRefreshOutlineRegular',
    'IconRightUpOutlineRegular',
    'IconSearchOutlineRegular',
    'IconTrashOutlineRegular',
  ]
  for (const name of modernNames) {
    assert.ok(fixtureText.includes(name), `${name} 不在 rc.3 导出清单里`)
    assert.ok(compatText.includes(name), `兼容层没有使用 ${name}`)
  }
})
