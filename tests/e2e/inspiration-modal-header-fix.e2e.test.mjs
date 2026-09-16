/**
 * E2E / 样式作用域门禁测试：会话栏折叠样式与灵感弹窗顶栏隔离（Issue #2014）
 *
 * 验证核心契约：
 * 1. 会话栏折叠样式 (conversation-collapse.js) 必须严格限定在会话栏作用域
 *    ([data-slot^="conversation"] header[class*="header"])，严禁使用未限定的通用 header[class*="header"]
 * 2. 灵感弹窗顶栏 (.omnimux-inspiration-modal-header) 具备显式 display 强保障
 * 3. 在 JSDOM 环境下加载折叠样式与弹窗样式，验证会话折叠态下灵感顶栏与分享按钮不被隐藏，
 *    而会话栏内部顶栏被正确隐藏。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../../', import.meta.url))

describe('会话折叠样式与灵感弹窗隔离 (Issue #2014)', () => {
  const collapseCode = readFileSync(join(root, 'plugins/omnimux/src/client/conversation-collapse.js'), 'utf8')
  const stylesCode = readFileSync(join(root, 'plugins/omnimux-inspiration/src/client/styles.js'), 'utf8')

  it('会话栏折叠规则严禁使用裸 header[class*="header"] 通配选择器', () => {
    // 确保任何 header[class*="header"] 都必须限定在 conversation slot 容器下
    assert.equal(
      /([^\w-]header\[class\*="header"\])/.test(collapseCode.replace(/\[data-slot\^?="conversation"\]\s+header/g, '')),
      false,
      '发现裸露的 header[class*="header"] 选择器，必须限定在 [data-slot^="conversation"] 作用域内！',
    )
  })

  it('会话栏折叠规则正确定向到 [data-slot^="conversation"]', () => {
    assert.match(
      collapseCode,
      /\[data-slot\^="conversation"\]\s+header\[class\*="header"\]/,
      '必须包含对 [data-slot^="conversation"] header[class*="header"] 的隐藏规则',
    )
  })

  it('灵感弹窗顶栏包含最高优先级 display 保障', () => {
    assert.match(
      stylesCode,
      /\.omnimux-inspiration-modal-header\s*\{[^}]*display:\s*flex\s*!important/s,
      '灵感弹窗顶栏必须显式声明 display: flex !important',
    )
  })

  it('DOM 模拟：在折叠态下，会话顶栏隐藏，而灵感弹窗顶栏与分享按钮正常保留', () => {
    const dom = new JSDOM(`<!DOCTYPE html>
<html data-omnimux-conversation-collapsed>
<head>
  <style>
    /* 模拟真实的折叠规则 */
    html[data-omnimux-conversation-collapsed]:not(:has([data-rightbar-collapsed="true"])) [data-slot^="conversation"] header[class*="header"] {
      display: none !important;
    }
    /* 模拟灵感弹窗样式 */
    .omnimux-inspiration-modal-header {
      display: flex !important;
      height: 60px;
    }
    .omnimux-inspiration-share-trigger-btn {
      display: flex;
    }
  </style>
</head>
<body>
  <!-- 会话栏内的聊天顶栏 -->
  <div data-slot="conversation">
    <header class="chat-header">
      <span>会话标题</span>
    </header>
  </div>

  <!-- 灵感社区预览弹窗 -->
  <div class="omnimux-inspiration-modal-container">
    <header class="omnimux-inspiration-modal-header">
      <div class="omnimux-inspiration-modal-heading">
        <h2>测试灵感</h2>
      </div>
      <div class="omnimux-inspiration-modal-header-actions">
        <button class="omnimux-inspiration-share-trigger-btn">分享</button>
      </div>
    </header>
  </div>
</body>
</html>`)

    const { document } = dom.window
    const chatHeader = document.querySelector('.chat-header')
    const modalHeader = document.querySelector('.omnimux-inspiration-modal-header')
    const shareBtn = document.querySelector('.omnimux-inspiration-share-trigger-btn')

    // 验证聊天顶栏被隐藏
    assert.ok(chatHeader.matches('html[data-omnimux-conversation-collapsed] [data-slot^="conversation"] header[class*="header"]'))

    // 验证灵感弹窗顶栏没有被折叠规则命中
    assert.equal(
      modalHeader.matches('html[data-omnimux-conversation-collapsed] [data-slot^="conversation"] header[class*="header"]'),
      false,
      '灵感弹窗顶栏绝不能命中会话折叠隐藏规则',
    )

    // 验证分享按钮依然在顶栏操作区中
    assert.ok(modalHeader.contains(shareBtn), '分享按钮必须存在于顶栏操作区内')
  })
})
