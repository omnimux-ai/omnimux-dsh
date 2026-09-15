/**
 * scripts/verify-stage-scroll-contract.test.mjs
 * 一级页滚动归属契约门禁的自测（Issue 1977）。
 *
 * 硬断言：
 *  1. 真仓通过；
 *  2. 反向对照：样式表漏掉契约类或改写声明 → 变红；
 *  3. 反向对照：页面完全不引用契约类 → 变红；
 *  4. 反向对照：吸附类与滚动类写在同一个 className → 变红。
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  SCROLL_CLASS,
  STICKY_CLASS,
  extractDeclarations,
  normalizeDecls,
  verifyStageScrollContract,
} from './verify-stage-scroll-contract.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CANONICAL_STYLES = `
.omx-stage-sticky {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
}
.omx-stage-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
`

const PAGE_GOOD = `export function Page() {
  return (
    <div className="demo-stage omx-stage-scroll">
      <div className="omx-stage-sticky"><nav /></div>
      <div><grid /></div>
    </div>
  )
}
`

const PAGE_COLLIDED = `export function Page() {
  return <div className="demo-stage omx-stage-scroll omx-stage-sticky" />
}
`

const REGISTRY = [
  {
    plugin: 'demo',
    label: '演示页',
    styles: 'plugins/demo/src/client/styles.js',
    pages: ['plugins/demo/src/client/Page.jsx'],
  },
]

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'stage-scroll-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

function withFixture(files, fn) {
  const root = fixture(files)
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('verify-stage-scroll-contract', () => {
  it('normalizeDecls 抹平排版差异（空白/分号/逗号后空格）', () => {
    assert.equal(normalizeDecls('flex: 1 1 auto;\n  min-height: 0;'), 'flex:1 1 auto;min-height:0')
    assert.equal(normalizeDecls('a, b'), normalizeDecls('a,b'))
  })

  it('extractDeclarations 能取出压缩单行与多行两种写法', () => {
    assert.deepEqual(extractDeclarations('.omx-stage-sticky{top:0}', STICKY_CLASS), ['top:0'])
    assert.equal(extractDeclarations(CANONICAL_STYLES, SCROLL_CLASS).length, 1)
  })

  it('本仓当前全部登记一级页通过', () => {
    const result = verifyStageScrollContract(REPO_ROOT)
    assert.ok(result.ok, `期望通过，实际违规: ${result.problems?.join(' | ')}`)
    assert.ok(result.checked >= 5, '登记的一级页应覆盖 5 个插件')
  })

  it('反向对照：样式表改写契约声明 → 变红', () => {
    withFixture(
      {
        'plugins/demo/src/client/styles.js': '.omx-stage-sticky{position:sticky;top:8px}\n.omx-stage-scroll{overflow:auto}',
        'plugins/demo/src/client/Page.jsx': PAGE_GOOD,
      },
      (root) => {
        const result = verifyStageScrollContract(root, REGISTRY)
        assert.equal(result.ok, false, '滚动/吸附声明被改写必须失败')
        assert.ok(
          result.problems.some((p) => p.includes('声明与契约不一致')),
          `应报告声明漂移，实际: ${result.problems.join(' | ')}`,
        )
      },
    )
  })

  it('反向对照：页面完全不引用契约类 → 变红', () => {
    withFixture(
      {
        'plugins/demo/src/client/styles.js': CANONICAL_STYLES,
        'plugins/demo/src/client/Page.jsx': 'export function Page() { return <div className="demo-stage" /> }\n',
      },
      (root) => {
        const result = verifyStageScrollContract(root, REGISTRY)
        assert.equal(result.ok, false, '未使用契约类必须失败')
        assert.ok(result.problems.some((p) => p.includes('未使用')), `实际: ${result.problems.join(' | ')}`)
      },
    )
  })

  it('反向对照：两个角色类写在同一 className → 变红', () => {
    withFixture(
      {
        'plugins/demo/src/client/styles.js': CANONICAL_STYLES,
        'plugins/demo/src/client/Page.jsx': PAGE_COLLIDED,
      },
      (root) => {
        const result = verifyStageScrollContract(root, REGISTRY)
        assert.equal(result.ok, false, '角色冲突必须失败')
        assert.ok(result.problems.some((p) => p.includes('角色冲突')), `实际: ${result.problems.join(' | ')}`)
      },
    )
  })
})
