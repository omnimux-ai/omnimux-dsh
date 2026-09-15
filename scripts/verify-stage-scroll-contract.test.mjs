/**
 * scripts/verify-stage-scroll-contract.test.mjs
 * 一级页滚动归属契约门禁的自测（Issue 1977）。
 *
 * 三条硬断言：
 *  1. 真仓通过（本任务落地后必须为绿）；
 *  2. 反向对照：把固定栈挪到滚动区之后 → 门禁变红；
 *  3. 反向对照：样式表漏掉契约类或改写声明 → 门禁变红。
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  PINNED_CLASS,
  SCROLL_CLASS,
  extractDeclarations,
  normalizeDecls,
  verifyStageScrollContract,
} from './verify-stage-scroll-contract.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CANONICAL_STYLES = `
.omx-stage-pinned {
  flex: none;
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
    <div className="demo-stage">
      <div className="omx-stage-pinned"><nav /></div>
      <div className="omx-stage-scroll"><grid /></div>
    </div>
  )
}
`

const PAGE_REGRESSED = `export function Page() {
  return (
    <div className="demo-stage">
      <div className="omx-stage-scroll"><grid /></div>
      <div className="omx-stage-pinned"><nav /></div>
    </div>
  )
}
`

const REGISTRY = [
  {
    plugin: 'demo',
    label: '演示页',
    styles: 'plugins/demo/src/client/styles.js',
    pages: [{ file: 'plugins/demo/src/client/Page.jsx', rootMarker: 'className="demo-stage"' }],
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

describe('verify-stage-scroll-contract', () => {
  it('normalizeDecls 抹平空白与尾分号以便跨插件逐字比对', () => {
    assert.equal(normalizeDecls('flex: 1 1 auto;\n  min-height: 0;'), 'flex:1 1 auto;min-height:0')
    assert.equal(normalizeDecls('flex:none'), normalizeDecls('flex: none;'))
  })

  it('extractDeclarations 能取出压缩单行与多行两种写法', () => {
    assert.deepEqual(extractDeclarations('.omx-stage-pinned{flex:none}', PINNED_CLASS), ['flex:none'])
    assert.deepEqual(extractDeclarations(CANONICAL_STYLES, SCROLL_CLASS).length, 1)
  })

  it('本仓当前全部登记一级页通过', () => {
    const result = verifyStageScrollContract(REPO_ROOT)
    assert.ok(result.ok, `期望通过，实际违规: ${result.problems?.join(' | ')}`)
    assert.ok(result.checked >= 5, '登记的一级页应覆盖 5 个插件')
  })

  it('反向对照：固定栈排到滚动区之后 → 变红', () => {
    const root = fixture({
      'plugins/demo/src/client/styles.js': CANONICAL_STYLES,
      'plugins/demo/src/client/Page.jsx': PAGE_REGRESSED,
    })
    try {
      const result = verifyStageScrollContract(root, REGISTRY)
      assert.equal(result.ok, false, '导航挪进滚动区之后必须失败')
      assert.ok(
        result.problems.some((p) => p.includes('固定栈渲染在滚动区之后')),
        `应报告固定栈顺序问题，实际: ${result.problems.join(' | ')}`,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反向对照：样式表改写契约声明 → 变红', () => {
    const root = fixture({
      'plugins/demo/src/client/styles.js': `.omx-stage-pinned{flex:none}\n.omx-stage-scroll{overflow:auto}`,
      'plugins/demo/src/client/Page.jsx': PAGE_GOOD,
    })
    try {
      const result = verifyStageScrollContract(root, REGISTRY)
      assert.equal(result.ok, false, '滚动区声明被改写必须失败')
      assert.ok(
        result.problems.some((p) => p.includes('声明与契约不一致')),
        `应报告声明漂移，实际: ${result.problems.join(' | ')}`,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反向对照：页面完全不用契约类 → 变红', () => {
    const root = fixture({
      'plugins/demo/src/client/styles.js': CANONICAL_STYLES,
      'plugins/demo/src/client/Page.jsx': 'export function Page() { return <div className="demo-stage" /> }\n',
    })
    try {
      const result = verifyStageScrollContract(root, REGISTRY)
      assert.equal(result.ok, false, '未使用契约类必须失败')
      assert.ok(result.problems.some((p) => p.includes('未使用')), `实际: ${result.problems.join(' | ')}`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
