// 客户端外壳的静态契约测试：只读源码文本，不建 DOM、不渲染组件。
//
// 这些断言守的是「外壳装配」这一层无法靠单测覆盖的约定：
//   · 双面板骨架（登记过的契约例外）：页根不滚动、左右面板各自内部滚动，
//     页眉仍带 omx-stage-sticky 契约类；
//   · 左栏行必须经中枢仲裁判定开关，且必须带自己的 dataset 标记；
//   · 客户端源码不得依赖 Node 内建模块，也不得出现抢占产品级 overlay 的调用；
//   · 预设快照必须在页面里注入，否则 usablePresets() 永远是空的。
//
// 说明：扫描范围排除 *.test.* 文件——测试本身要读盘（node:fs/node:path），
// 而且任何断言「禁止出现某标记」的测试都必须写出该标记本身；
// 被扫描的是随包发布的客户端源码（SHIPPED_CLIENT_FILES）。

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const CLIENT_DIR = dirname(fileURLToPath(import.meta.url))

/** 禁止出现的产品级 overlay 标记（按片段拼装，避免断言文本自身命中扫描）。 */
const BANNED_MARKERS = ['claimProduct' + 'Stage', 'data-dsh-product-' + 'stage', 'shell.' + 'overlay']

/** 原生下拉框标签：本仓 UI01 明令禁止，下拉一律自绘。 */
const NATIVE_SELECT = new RegExp('<' + 'select' + '\\b')

/** 禁止在客户端源码里出现的 Node 内建模块。 */
const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'net', 'http', 'crypto', 'child_process'])

/** import / require / 动态 import 的模块说明符。 */
const SPECIFIER_RE = /(?:from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g

const IS_TEST_FILE = /\.test\.(?:js|mjs|jsx)$/

/** @param {string} name @returns {string} */
function readClient(name) {
  return readFileSync(join(CLIENT_DIR, name), 'utf8')
}

/** 递归列出 src/client 下的文件（仓库相对 src/client 的路径）。 */
function listClientFiles(dir = CLIENT_DIR) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...listClientFiles(full))
    } else if (entry.isFile()) {
      out.push(relative(CLIENT_DIR, full).replace(/\\/g, '/'))
    }
  }
  return out
}

/** @param {string} text @returns {string[]} */
function specifiersOf(text) {
  const found = []
  for (const match of text.matchAll(SPECIFIER_RE)) found.push(match[1])
  return found
}

/** 模块说明符对应的 Node 内建名（非内建返回 null）。 */
function builtinOf(specifier) {
  const bare = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier
  return NODE_BUILTINS.has(bare) ? bare : null
}

/** 断言某次调用出现在模块顶层（早于第一个导出函数）。 */
function assertTopLevelCall(source, file, needle) {
  const callAt = source.indexOf(needle)
  assert.ok(callAt >= 0, `${file} must call ${needle}`)
  const exportAt = source.indexOf('export function')
  assert.ok(
    exportAt < 0 || callAt < exportAt,
    `${file} must call ${needle} at module top level, not inside a component`
  )
}

const ALL_CLIENT_FILES = listClientFiles()
const SHIPPED_CLIENT_FILES = ALL_CLIENT_FILES.filter((rel) => !IS_TEST_FILE.test(rel))

describe('client entry (index.js)', () => {
  const source = readClient('index.js')

  it('declares the studio Tab id used by both the Tab and the rail row', () => {
    assert.ok(source.includes("AVATAR_TAB_ID = 'omnimux-avatar:studio'"))
  })

  it('registers the left-rail row with its own dataset marker', () => {
    assert.ok(source.includes('data-omnimux-avatar-entry'))
    assert.ok(source.includes('datasetKey'))
    assert.ok(source.includes("customClassName: 'omnimux-avatar-entry'"))
  })

  it('injects its stylesheet at module top level', () => {
    assertTopLevelCall(source, 'index.js', 'injectAvatarStyles()')
  })

  it('declares the inject list required by the workbench seat', () => {
    assert.ok(source.includes("export const inject = ['slots', 'locale']"))
  })

  it('never claims a product stage or a shell overlay', () => {
    for (const marker of BANNED_MARKERS) {
      assert.ok(!source.includes(marker), `index.js must not contain ${marker}`)
    }
  })
})

describe('stage skeleton (AvatarStage.jsx)', () => {
  const source = readClient('AvatarStage.jsx')

  it('injects its stylesheet from inside the Stage file', () => {
    assertTopLevelCall(source, 'AvatarStage.jsx', 'injectAvatarStyles()')
  })

  it('references the sticky contract class and the live-stage body class', () => {
    for (const cls of ['omx-stage-sticky', 'omnimux-avatar-body']) {
      assert.ok(source.includes(cls), `AvatarStage.jsx must reference ${cls}`)
    }
  })

  it('keeps the two-pane layout: page root does not scroll', () => {
    const classNames = [...source.matchAll(/className\s*=\s*["'`]([^"'`]*)["'`]/g)].map(
      (match) => match[1]
    )
    assert.ok(classNames.length > 0, 'AvatarStage.jsx must declare className attributes')
    for (const value of classNames) {
      assert.ok(
        !(value.includes('omx-stage-scroll') && value.includes('omx-stage-sticky')),
        `one className must not carry both contract classes: ${value}`
      )
    }
    // 双面板例外：页根不再是整页滚动容器；页眉仍带契约吸附类。
    assert.ok(
      !classNames.some((value) => value.includes('omx-stage-scroll')),
      'the page root must not be the scroll container (two-pane exception)'
    )
    assert.ok(
      classNames.some((value) => value.includes('omx-stage-sticky')),
      'the header row must be the sticky stack'
    )
    // 左右两条内部滚动区必须由共享类承载。
    assert.ok(
      classNames.filter((value) => value.includes('omx-avatar-scroll')).length >= 2,
      'both panes need the shared inner-scroll class'
    )
  })

  it('injects the preset snapshot before reading usable presets', () => {
    assert.ok(source.includes('fetchPresets()'), 'AvatarStage.jsx must fetch the preset payload')
    const injectAt = source.indexOf('setPresetSnapshot(')
    assert.ok(
      injectAt >= 0,
      'AvatarStage.jsx must call setPresetSnapshot() or usablePresets() stays empty'
    )
    const readAt = source.indexOf('usablePresets(taxonomy)')
    assert.ok(readAt >= 0, 'AvatarStage.jsx must read usablePresets(taxonomy)')
    assert.ok(injectAt < readAt, 'the snapshot must be injected before presets are read')
  })

  it('never fabricates progress with Math.random', () => {
    assert.ok(
      !source.includes('Math.random'),
      'AvatarStage.jsx must not use Math.random as a progress source'
    )
  })
})

describe('shipped client sources', () => {
  it('are actually covered by this scan', () => {
    for (const rel of ['index.js', 'AvatarStage.jsx']) {
      assert.ok(SHIPPED_CLIENT_FILES.includes(rel), `${rel} must be part of the scanned set`)
    }
    assert.ok(SHIPPED_CLIENT_FILES.length > 10, 'the scan must cover the whole client tree')
    assert.ok(
      ALL_CLIENT_FILES.length > SHIPPED_CLIENT_FILES.length,
      'the *.test.* exclusion must actually drop test files'
    )
  })

  it('import no Node builtin', () => {
    for (const rel of SHIPPED_CLIENT_FILES) {
      for (const specifier of specifiersOf(readClient(rel))) {
        const builtin = builtinOf(specifier)
        assert.equal(builtin, null, `${rel} must not import the Node builtin ${specifier}`)
      }
    }
  })

  it('contain no product-stage claim and no native select tag', () => {
    for (const rel of SHIPPED_CLIENT_FILES) {
      const source = readClient(rel)
      for (const marker of BANNED_MARKERS) {
        assert.ok(!source.includes(marker), `${rel} must not contain ${marker}`)
      }
      assert.ok(!NATIVE_SELECT.test(source), `${rel} must not use a native select element`)
    }
  })
})
