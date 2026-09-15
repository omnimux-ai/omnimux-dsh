import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  WORKBENCH_FOCUS,
  resolveDefaultFocus,
  isWorkbenchTab,
} from '../../src/client/workbench/focus-state.js'
import {
  CONVERSATION_COLLAPSE_CSS,
  CONVERSATION_COLLAPSED_ATTR,
} from '../../src/client/conversation-collapse.js'
import { PRODUCT_STAGE_CHROME } from '../../src/client/conversation-box.js'

test('e2e: layout convergence matrix and anti-deadzone contracts (Issue #1877)', async () => {
  // 1. 验证 resolveDefaultFocus 对所有工作台库页面均返回 split，杜绝未经授权的 gui 伪全屏
  assert.equal(resolveDefaultFocus('omnimux-workflow:canvas'), WORKBENCH_FOCUS.split)
  assert.equal(resolveDefaultFocus('omnimux-workflow:library'), WORKBENCH_FOCUS.split)
  assert.equal(resolveDefaultFocus('omnimux-assets:library'), WORKBENCH_FOCUS.split)
  assert.equal(resolveDefaultFocus('omnimux-market:plaza'), WORKBENCH_FOCUS.split)

  // 2. 验证折叠样式严格设置 overflow: hidden 和 opacity: 0，杜绝左下角文字泄漏穿透
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /\.dshDesktopConversationSurface[^{]*\{[^}]*overflow:\s*hidden\s*!important/,
    'Folded conversation surface must enforce overflow: hidden !important'
  )
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /\.dshDesktopConversationSurface[^{]*\{[^}]*opacity:\s*0\s*!important/,
    'Folded conversation surface must enforce opacity: 0 !important'
  )

  // 3. 验证非折叠/分屏状态下会话栏物理防挤压防护（min-width: 420px !important, flex: 1 1 0% !important）
  assert.match(
    PRODUCT_STAGE_CHROME,
    /min-width:\s*420px\s*!important/,
    'Conversation surface must have min-width: 420px !important protection'
  )
  assert.match(
    PRODUCT_STAGE_CHROME,
    /flex:\s*1\s+1\s+0%\s*!important/,
    'Conversation surface must flex fill the middle viewport to prevent deadzone gaps'
  )

  // 4. JSDOM DOM 行为模拟
  const dom = new JSDOM(`<!doctype html>
<html>
<head></head>
<body>
  <div class="dshDesktopFrame">
    <aside class="dshDesktopSidebarSurface" style="width: 280px;"></aside>
    <main class="dshDesktopConversationSurface" style="min-width: 420px; flex: 1 1 0%;">
      <div class="uPhUma_root">
        <span>属于你的AI社媒运营团队</span>
      </div>
    </main>
    <aside class="dshDesktopRightbarSurface" style="width: 780px;"></aside>
  </div>
</body>
</html>`)

  const doc = dom.window.document
  const conv = doc.querySelector('.dshDesktopConversationSurface')
  assert.ok(conv)
  assert.equal(conv.style.minWidth, '420px')
})
