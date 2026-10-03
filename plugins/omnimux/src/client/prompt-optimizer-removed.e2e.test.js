import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * Issue #3026 下线契约：输入框「优化提示词」整体移除后，仓库内不得残留
 * 槽位注册、宿主路由、文案键与功能文件（其自身测试目录亦已删除）。
 */
describe('「优化提示词」下线移除契约', () => {
  it('客户端不再注册 omnimux-prompt-optimizer，也不再挂桥', () => {
    const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
    assert.equal(src.includes('omnimux-prompt-optimizer'), false)
    assert.equal(src.includes('OptimizeButton'), false)
    assert.equal(src.includes('installOptimizeBridge'), false)
    assert.equal(src.includes('prompt-optimizer'), false)
  })

  it('文案键 promptOptimize.* 从中英词典全部移除', () => {
    const src = readFileSync(new URL('./locales.js', import.meta.url), 'utf8')
    assert.equal(src.includes('promptOptimize.'), false)
  })

  it('宿主不再注册路由与提供 promptOptimizer', () => {
    const src = readFileSync(new URL('../host/apply.js', import.meta.url), 'utf8')
    assert.equal(src.includes('registerPromptOptimizerRoutes'), false)
    assert.equal(src.includes('mountPromptOptimizer'), false)
    assert.equal(src.includes('prompt-optimizer'), false)
  })

  it('功能目录与模板资产已删除', () => {
    const here = new URL('..', import.meta.url).pathname
    assert.equal(existsSync(`${here}prompt-optimizer`), false, 'host prompt-optimizer 目录应不存在')
    assert.equal(existsSync(`${here}client/prompt-optimizer`), false, 'client prompt-optimizer 目录应不存在')
    assert.equal(existsSync(`${here.replace(/src\/$/, '')}assets/prompt-templates`), false, '模板资产应不存在')
  })
})
