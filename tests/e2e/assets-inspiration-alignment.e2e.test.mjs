/**
 * tests/e2e/assets-inspiration-alignment.e2e.test.mjs
 * 资产中心与灵感社区 20px 全局统一基准线对齐端到端契约测试 (Issue #2037)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E 契约一：资产中心样式必须 100% 收敛至 20px 基准线，杜绝 24px 孤岛', () => {
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
  const hubStylesPath = path.join(root, 'plugins/omnimux/src/client/styles.js')

  const styles = fs.readFileSync(stylesPath, 'utf8')
  const hubStyles = fs.readFileSync(hubStylesPath, 'utf8')

  // 验证关键类名 padding 全部收敛至 20px
  assert.match(styles, /\.omnimux-assets-action-row\s*\{[^}]*padding:\s*8px\s+20px\s+12px;/)
  assert.match(styles, /\.omnimux-assets-stage-toolbar\s*\{[^}]*padding:\s*0\s+20px;/)
  assert.match(styles, /\.omnimux-assets-local-nav\s*\{[^}]*padding:\s*12px\s+20px\s+14px;/)
  assert.match(styles, /\.omnimux-assets-main\s*\{[^}]*padding:\s*16px\s+20px;/)

  // 验证分割线不再单独给 assets 强加 24px
  assert.doesNotMatch(hubStyles, /\.omnimux-assets-stage\s*>\s*\[role="separator"\][^}]*margin-inline:\s*24px;/)
})

test('E2E 契约二：实机真实浏览器几何测量报告必须全量达成 20px 零误差垂直对齐', () => {
  const reportPath = path.join(root, 'docs/evidence/assets-inspiration-alignment-unify-report.json')
  const pngPath = path.join(root, 'docs/evidence/assets-inspiration-alignment-unify-verified.png')

  assert.ok(fs.existsSync(reportPath), '必须存在专属实测报告')
  assert.ok(fs.existsSync(pngPath), '必须存在专属实机截图证据')
  assert.ok(fs.statSync(pngPath).size > 1000, '截图文件必须完整有效')

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(report.pass, true, '实机测量必须全绿通过')
  assert.equal(report.titleLeft, 20, '大标题必须落在 20px 基准线')
  assert.equal(report.actionBtnLeft, 20, '首个动作按钮必须落在 20px 基准线')
  assert.equal(report.dividerLeft, 20, '分割线左端点必须落在 20px 基准线')
  assert.equal(report.dividerRight, 20, '分割线右端点必须落在 20px 基准线')
  assert.equal(report.tabLabelLeft, 20, 'Tab 文字起始边必须落在 20px 基准线')
  assert.equal(report.chipLeft, 20, '二级分类胶囊必须落在 20px 基准线')
  assert.equal(report.cardLeft, 20, '卡片网格左边缘必须落在 20px 基准线')
})

test('E2E 契约三：大标题与动作按钮及卡片垂直重合，彻底根治 4px 错位', () => {
  const reportPath = path.join(root, 'docs/evidence/assets-inspiration-alignment-unify-report.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

  assert.equal(report.titleLeft, report.actionBtnLeft, '大标题与动作按钮必须 100% 垂直重合（差值为 0）')
  assert.equal(report.titleLeft, report.tabLabelLeft, '大标题与 Tab 文字必须 100% 垂直重合（差值为 0）')
  assert.equal(report.titleLeft, report.chipLeft, '大标题与二级胶囊必须 100% 垂直重合（差值为 0）')
  assert.equal(report.titleLeft, report.cardLeft, '大标题与内容卡片必须 100% 垂直重合（差值为 0）')
})
