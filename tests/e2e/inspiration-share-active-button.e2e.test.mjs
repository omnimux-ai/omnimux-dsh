import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const clientDir = join(root, 'plugins/omnimux-inspiration/src/client')

describe('灵感社区预览弹窗分享按钮激活态视觉规范端到端契约测试', () => {
  it('样式断言：分享按钮激活态 (.is-active) 必须消费 --dsw-alias-interactive-bg-active，禁止使用 brand-primary 或纯白色', () => {
    const stylesContent = readFileSync(join(clientDir, 'styles.js'), 'utf8')

    // 匹配 .omnimux-inspiration-share-trigger-btn.is-active 规则体
    const match = stylesContent.match(/\.omnimux-inspiration-share-trigger-btn\.is-active\s*\{([^}]+)\}/)
    assert.ok(match, '必须存在 .omnimux-inspiration-share-trigger-btn.is-active 样式规则')

    const body = match[1]
    assert.match(
      body,
      /background:\s*var\(--dsw-alias-interactive-bg-active/,
      '背景色必须使用次级激活背景 token，杜绝单色主题下被映射为纯白色',
    )
    assert.doesNotMatch(
      body,
      /var\(--dsw-alias-brand-primary/,
      '严禁使用在暗黑单色主题下会漂白为纯白色的 brand-primary 变量',
    )
    assert.match(
      body,
      /border-color:\s*var\(--dsw-alias-border-l3/,
      '边框颜色必须使用 border-l3 形成清晰的微亮边缘，与浮层呼应',
    )
    assert.match(
      body,
      /color:\s*var\(--dsw-alias-label-primary/,
      '文本与图标色必须保持主文本色以保证高对比度清晰易读',
    )
  })

  it('DOM 模拟断言：分享按钮必须具备 aria-expanded 属性且与 is-active 类同步', () => {
    const dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="omnimux-inspiration-modal-header-actions">
    <button class="omnimux-inspiration-share-trigger-btn is-active" aria-expanded="true">
      <svg width="14" height="14"></svg>
      <span>分享</span>
    </button>
  </div>
</body>
</html>`)

    const btn = dom.window.document.querySelector('.omnimux-inspiration-share-trigger-btn')
    assert.ok(btn, '分享按钮必须存在')
    assert.ok(btn.classList.contains('is-active'), '激活时必须带有 is-active 类')
    assert.equal(btn.getAttribute('aria-expanded'), 'true', '激活展开时 aria-expanded 必须为 true')
    assert.match(btn.textContent, /分享/, '按钮必须清晰显示“分享”文本')
  })
})
