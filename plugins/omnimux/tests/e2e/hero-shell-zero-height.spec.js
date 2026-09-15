import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPOSER_COMPACT_CSS } from '../../src/client/composer-compact.js'
import { GUIDE_CSS } from '../../src/client/session-guide/styles.js'

test('e2e: hero shell semantic display none on split and healthy auto height on fullscreen', () => {
  // 1. 验证 composer-compact 中的分屏隐藏外壳规则采用语义级 display:none，彻底杜绝零高度负空间居中上浮
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-phase=['"]hero['"]\]\s*\[class\*=['"]composerHero['"]\]\s*>\s*:first-child:not\(\.omnimux-welcome-header\)[\s\S]*?display:\s*none\s*!important/
  )

  // 2. 验证折叠状态判断挂在外框容器上，避免右栏收起时误判为分屏
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\.dshDesktopFrame:not\(\[data-rightbar-collapsed=['"]true['"]\]\):has\(\[data-sidebar-right-panel\]/
  )

  // 3. 验证 session-guide 中全屏长内容开屏外壳具备 auto 高度与 36px 呼吸留白
  assert.match(
    GUIDE_CSS,
    /\[data-omnimux-starter-host\]\s*\[class\*=['"]composerHero['"]\]\s*>\s*:first-child\s*\{[^}]*margin-top:\s*36px\s*!important/
  )
  assert.match(
    GUIDE_CSS,
    /\[data-omnimux-starter-host\]\s*\[class\*=['"]composerHero['"]\]\s*>\s*:first-child\s*\{[^}]*height:\s*auto\s*!important/
  )
})
