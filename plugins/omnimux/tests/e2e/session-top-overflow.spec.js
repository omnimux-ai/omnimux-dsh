import assert from 'node:assert/strict'
import test from 'node:test'
import { GUIDE_CSS } from '../../src/client/session-guide/styles.js'

test('e2e: default session top layout convergence and safe area breathing space', () => {
  // 1. [data-composer-seat] 在全屏模式拥有 [data-omnimux-starter-host] 时采用 flex-start 向上对齐，消除垂直居中向上负溢出
  assert.match(
    GUIDE_CSS,
    /\[data-omnimux-starter-host\]\s*\[data-composer-seat\]\s*\{[^}]*justify-content:\s*flex-start\s*!important/
  )

  // 2. [data-composer-seat] 预留顶部 56px 呼吸安全距离，彻底避让 macOS 交通灯控制按钮
  assert.match(
    GUIDE_CSS,
    /\[data-omnimux-starter-host\]\s*\[data-composer-seat\]\s*\{[^}]*padding-top:\s*56px\s*!important/
  )

  // 3. [class*="composerStack"] 采用 flex-start 自然流式排布
  assert.match(
    GUIDE_CSS,
    /\[data-omnimux-starter-host\]\s*\[class\*="composerStack"\]\s*\{[^}]*justify-content:\s*flex-start\s*!important/
  )

  // 4. [class*="composerHero"] 设定 flex: 0 0 auto，消除多余弹性撑高
  assert.match(
    GUIDE_CSS,
    /\[data-omnimux-starter-host\]\s*\[class\*="composerHero"\]\s*\{[^}]*flex:\s*0\s*0\s*auto\s*!important/
  )

  // 5. 分屏紧凑态（split-compact）依然保持 justify-content: flex-end 吸底能力
  assert.match(
    GUIDE_CSS,
    /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[data-composer-seat\][\s\S]*?justify-content:\s*flex-end\s*!important/
  )
})
