/**
 * E2E 契约：会话栏模型名称缩小自适应与底栏防换行优化（Issue #2192）。
 * 覆盖：
 *  1. 底栏工具行锁定单行禁止折行；
 *  2. 模型选择器按钮支持弹性收缩并设定最大宽度；
 *  3. 模型名称文本自动省略截断，在缩窄模式下进一步收敛宽度；
 *  4. 左侧建议词组声明 min-width: 0 与 flex: 1 1 auto，杜绝撑爆底栏。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPOSER_COMPACT_CSS } from '../../src/client/composer-compact.js'

test('E2E: 底栏工具行锁定单行禁止折行，杜绝模型与发送按钮掉入第二行', () => {
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] > \[class\*="row"\]:has\(> \[class\*="trailing"\]\)\{\s*flex-wrap:nowrap!important;/
  )
})

test('E2E: 模型选择按钮支持弹性缩放并具备最大宽度防护', () => {
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\]\{[^}]*min-width:28px!important;/
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\]\{[^}]*max-width:220px;/
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\]\{[^}]*flex-shrink:1!important;/
  )
})

test('E2E: 模型名称标签设置最大宽度并以省略号截断，且支持中窄自适应缩短', () => {
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\] \[class\*="triggerLabel"\]\{[^}]*max-width:120px;/
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\] \[class\*="triggerLabel"\]\{[^}]*text-overflow:ellipsis;/
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /@media \(max-width: 768px\)\{\s*\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\] \[class\*="triggerLabel"\]\{[^}]*max-width:88px;/
  )
})

test('E2E: 左侧工具栏具备弹性收缩能力，右侧操作区声明 flex-shrink: 0 保证稳定常驻', () => {
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="tools"\]\{\s*min-width:0;\s*flex:1 1 auto;\s*\}/
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="trailing"\]\{\s*flex-shrink:0;\s*display:inline-flex;\s*align-items:center;\s*\}/
  )
})
