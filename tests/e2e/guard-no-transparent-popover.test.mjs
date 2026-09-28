import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  scanPopoverOpacity,
  checkContentForTransparencyViolations,
} from '../../scripts/guard-no-transparent-popover.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('硬门禁 1: 全库实际代码防透底与 Token 兜底扫描 (0 违规通过)', () => {
  const { scannedFiles, violations } = scanPopoverOpacity()
  assert.ok(scannedFiles > 0, '必须扫描到有效的源文件')
  const fatalViolations = violations.filter((v) => v.fatal)
  assert.equal(
    fatalViolations.length,
    0,
    `全库严禁存在浮层透底违规，实际违规项: ${JSON.stringify(fatalViolations)}`
  )
})

test('硬门禁 2: sidebar-coordinator.js 探索菜单纯实体深色背景断言 (解决透光透字缺陷)', () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const content = fs.readFileSync(coordinatorPath, 'utf8')

  const menuMatch = content.match(/\.omnimux-explore-menu\s*\{([^}]+)\}/)
  assert.ok(menuMatch, '必须找到 .omnimux-explore-menu 样式块')
  const styleBody = menuMatch[1]

  // 1. 严禁任何伪毛玻璃透底滤镜
  assert.equal(
    /backdrop-filter/i.test(styleBody),
    false,
    '.omnimux-explore-menu 严禁声明 backdrop-filter，杜绝将中栏内容模糊透射出来'
  )

  // 2. 严禁裸用未定义的 --dsw-alias-bg-elevated
  assert.equal(
    /var\(\s*--dsw-alias-bg-elevated\s*\)/.test(styleBody),
    false,
    '.omnimux-explore-menu 严禁裸写 var(--dsw-alias-bg-elevated)，防止计算值回退为 transparent'
  )

  // 3. 必须使用标准带实体兜底的 overlay 浮层变量
  assert.match(
    styleBody,
    /background:\s*var\(--dsw-alias-bg-overlay,\s*var\(--dsw-alias-bg-layer-2,\s*#1c1c1f\)\)/,
    '.omnimux-explore-menu 必须使用官方规范实体浮层底色链'
  )
})

test('硬门禁 3: 故障注入测试 (Fault Injection) - 验证门禁能够确定性硬拦截违规代码', () => {
  // 故障样本 A: 菜单包含 backdrop-filter 伪毛玻璃
  const faultySnippetA = `
    .omnimux-sample-menu {
      position: fixed;
      background: #1c1c1f;
      backdrop-filter: blur(16px);
    }
  `
  const violationsA = checkContentForTransparencyViolations(faultySnippetA, 'mock-a.css')
  assert.ok(
    violationsA.some((v) => v.rule === 'POPOVER_NO_BACKDROP_BLUR' && v.fatal),
    '门禁必须精确拦截包含 backdrop-filter 的浮层菜单'
  )

  // 故障样本 B: 探索菜单裸写未定义的 var(--dsw-alias-bg-elevated)
  const faultySnippetB = `
    .omnimux-explore-menu {
      position: fixed;
      background: var(--dsw-alias-bg-elevated);
    }
  `
  const violationsB = checkContentForTransparencyViolations(faultySnippetB, 'sidebar-coordinator.js')
  assert.ok(
    violationsB.some((v) => v.rule === 'NO_BARE_BG_ELEVATED' && v.fatal),
    '门禁必须精确拦截裸写未定义变量 var(--dsw-alias-bg-elevated)'
  )

  // 故障样本 C: 探索菜单丢失实体背景定义
  const faultySnippetC = `
    .omnimux-explore-menu {
      position: fixed;
      border: 1px solid #333;
    }
  `
  const violationsC = checkContentForTransparencyViolations(faultySnippetC, 'sidebar-coordinator.js')
  assert.ok(
    violationsC.some((v) => v.rule === 'EXPLORE_MENU_MUST_BE_SOLID_OVERLAY' && v.fatal),
    '门禁必须精确拦截未显式声明官方不透明背景的探索菜单'
  )
})
