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

test('硬门禁 2: sidebar-coordinator.js 不得再定义自绘探索浮层（入口已迁至官方「更多」菜单）', () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const content = fs.readFileSync(coordinatorPath, 'utf8')

  // 自绘「探索」常驻行与浮动菜单已退役（#3785）：该浮层的深色底约束随之失去守卫对象。
  // 若它被重新引入，就会在官方「更多」菜单之外多出一个不受本门禁约束的浮层 —— 这里挡回退。
  assert.equal(
    /\.omnimux-explore-menu\s*\{/.test(content),
    false,
    'sidebar-coordinator.js 不得再定义 .omnimux-explore-menu 浮层样式（入口已在官方「更多」菜单）'
  )
  assert.equal(
    content.includes('omnimux-sidebar-explore-styles'),
    false,
    'sidebar-coordinator.js 不得再注入探索浮层样式节点'
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

  // 故障样本 C: 探索菜单滥用中浅灰 --dsw-alias-bg-overlay (#61666b) 导致严重白灰偏色
  const faultySnippetC = `
    .omnimux-explore-menu {
      position: fixed;
      background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c1c1f));
    }
  `
  const violationsC = checkContentForTransparencyViolations(faultySnippetC, 'sidebar-coordinator.js')
  assert.ok(
    violationsC.some((v) => v.rule === 'POPOVER_NO_BG_OVERLAY_DISCOLORATION' && v.fatal),
    '门禁必须精确拦截滥用 --dsw-alias-bg-overlay 造成的浅灰偏色缺陷'
  )
})
